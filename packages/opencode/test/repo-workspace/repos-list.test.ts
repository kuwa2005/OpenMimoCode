import { describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import * as RepoWorkspace from "../../src/repo-workspace"

const dirs: string[] = []
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "oimo-repos-"))
  dirs.push(d)
  return d
}
function gitInit(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
  expect(Bun.spawnSync(["git", "init"], { cwd: dir }).exitCode).toBe(0)
}

describe("repos.txt", () => {
  test("parses URL list and resolves sibling clones", async () => {
    const root = tmp()
    const frontend = path.join(root, "frontend")
    const backend = path.join(root, "backend")
    gitInit(frontend)
    gitInit(backend)
    const listPath = path.join(root, ".oimo", "repos.txt")
    fs.mkdirSync(path.dirname(listPath), { recursive: true })
    fs.writeFileSync(
      listPath,
      [
        "name: demo",
        "primary: backend",
        "https://github.com/example/frontend",
        "https://github.com/example/backend",
        "https://github.com/example/infra read-only",
      ].join("\n"),
    )
    // infra missing → path_missing on load
    gitInit(path.join(root, "infra"))

    const info = await RepoWorkspace.loadFromReposList(listPath, root)
    expect(info.name).toBe("demo")
    expect(info.primaryRepositoryId).toBe("backend")
    expect(info.repositories.get("infra")?.access).toBe("read-only")
    expect(info.repositories.get("frontend")?.role).toContain("github.com/example/frontend")

    const viaPrimary = await RepoWorkspace.loadFromPrimary(root)
    expect(viaPrimary?.repositories.size).toBe(3)
  })

  test("cloneCommands lists missing URLs", () => {
    const list = RepoWorkspace.parseReposList(`https://github.com/org/a\nhttps://github.com/org/b\n`)
    const root = tmp()
    const cmds = RepoWorkspace.cloneCommands(list, root)
    expect(cmds.length).toBe(2)
    expect(cmds[0]).toContain("git clone https://github.com/org/a")
  })
})

describe("gitmodules", () => {
  test("parseGitmodules reads sample-like content", () => {
    const entries = RepoWorkspace.parseGitmodules(`
[submodule "frontend"]
	path = frontend
	url = https://github.com/example-org/frontend.git
	branch = main
[submodule "backend"]
	path = backend
	url = https://github.com/example-org/backend.git
`)
    expect(entries).toEqual([
      {
        name: "frontend",
        path: "frontend",
        url: "https://github.com/example-org/frontend.git",
        branch: "main",
      },
      {
        name: "backend",
        path: "backend",
        url: "https://github.com/example-org/backend.git",
      },
    ])
  })

  test("loadFromGitmodules registers superproject + nested submodules", () => {
    const root = tmp()
    gitInit(root)
    fs.writeFileSync(
      path.join(root, ".gitmodules"),
      [
        '[submodule "frontend"]',
        "\tpath = frontend",
        "\turl = https://github.com/example/frontend.git",
        '[submodule "backend"]',
        "\tpath = backend",
        "\turl = https://github.com/example/backend.git",
        "\tbranch = main",
      ].join("\n"),
    )
    // initialized submodule
    gitInit(path.join(root, "frontend"))
    // backend left uninitialized (empty dir without .git)
    fs.mkdirSync(path.join(root, "backend"), { recursive: true })

    // Need a commit on superproject for ls-tree; optional for inspect
    Bun.spawnSync(["git", "config", "user.email", "t@t"], { cwd: root })
    Bun.spawnSync(["git", "config", "user.name", "t"], { cwd: root })

    const info = RepoWorkspace.loadFromGitmodules(root)
    expect(info.layout).toBe("superproject")
    expect([...info.repositories.values()].some((r) => r.kind === "superproject")).toBe(true)
    expect([...info.repositories.values()].filter((r) => r.kind === "submodule").length).toBe(2)

    const report = RepoWorkspace.doctor(info)
    expect(report.issues.some((i) => i.code === "submodule_uninitialized")).toBe(true)
    expect(report.issues.some((i) => i.code === "superproject_layout")).toBe(true)
    // nested sibling rejection must not apply
    expect(() => RepoWorkspace.loadFromGitmodules(root)).not.toThrow()
  })
})
