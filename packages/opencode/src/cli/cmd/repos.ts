import { cmd } from "./cmd"
import { Instance } from "../../project/instance"
import * as RepoWorkspace from "../../repo-workspace"
import type { Argv } from "yargs"

async function withCwd<T>(fn: () => Promise<T>) {
  return Instance.provide({
    directory: process.cwd(),
    fn,
  })
}

const ReposListCommand = cmd({
  command: "list",
  aliases: ["ls"],
  describe: "登録済み Repository を一覧表示する",
  async handler() {
    await withCwd(async () => {
      const info = await RepoWorkspace.Runtime.load(Instance.directory)
      if (!info) {
        console.log("No multi-repo workspace configured (repos.txt / workspace.yaml / .gitmodules).")
        console.log("See docs/multi-repo/README.md")
        return
      }
      console.log(`${info.name}  primary=${info.primaryRepositoryId}  layout=${info.layout ?? "siblings"}`)
      console.log(`config: ${info.configPath}`)
      for (const repo of info.repositories.values()) {
        const access = repo.access === "read-only" ? "ro" : "rw"
        console.log(`  [${repo.kind}] ${repo.id}  ${access}  ${repo.canonicalPath}${repo.role ? `  (${repo.role})` : ""}`)
      }
    })
  },
})

const ReposDoctorCommand = cmd({
  command: "doctor",
  describe: "Workspace の整合性を検査する",
  async handler() {
    await withCwd(async () => {
      const info = await RepoWorkspace.Runtime.load(Instance.directory)
      if (!info) {
        console.log("No multi-repo workspace configured.")
        return
      }
      const report = RepoWorkspace.doctor(info)
      console.log(`${report.ok ? "OK" : "ISSUES"}  ${report.name}  repos=${report.repositoryCount}`)
      for (const issue of report.issues) {
        const where = issue.repositoryId ? ` [${issue.repositoryId}]` : ""
        console.log(`  ${issue.severity}${where}: ${issue.code} — ${issue.message}`)
      }
      if (report.issues.length === 0) console.log("  (no issues)")
    })
  },
})

export const ReposCommand = cmd({
  command: "repos",
  describe: "マルチリポジトリ Workspace（list / doctor）",
  builder: (yargs: Argv) => yargs.command(ReposListCommand).command(ReposDoctorCommand).demandCommand(),
  async handler() {},
})
