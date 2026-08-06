import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { Session } from "../../session"
import { ClaudeImport } from "../../session/claude-import"
import { SessionID } from "../../session/schema"
import { bootstrap } from "../bootstrap"
import { UI } from "../ui"
import { Locale, Log } from "../../util"
import { Process } from "../../util"
import { Installation } from "../../installation"
import * as prompts from "@clack/prompts"
import { EOL } from "os"
import { AppRuntime } from "@/effect/app-runtime"

export const SessionCommand = cmd({
  command: "session",
  describe: "manage sessions",
  builder: (yargs: Argv) =>
    yargs.command(SessionListCommand).command(SessionDeleteCommand).command(SessionImportClaudeCommand).demandCommand(),
  async handler() {},
})

export const SessionImportClaudeCommand = cmd({
  command: "import-claude",
  describe: "import Claude Code sessions (~/.claude/projects) into oimo",
  builder: (yargs: Argv) =>
    yargs.option("force", {
      describe: "re-sync every session, ignoring the mtime cache",
      type: "boolean",
      default: false,
    }),
  handler: async (args) => {
    const stats = await ClaudeImport.run({ force: args.force })
    UI.println(
      `Claude import: scanned ${stats.scanned}, imported ${stats.imported}, resynced ${stats.resynced}, skipped ${stats.skipped}` +
        (stats.errors.length ? `, errors ${stats.errors.length}` : ""),
    )
    for (const err of stats.errors) UI.error(err)
  },
})

export const SessionDeleteCommand = cmd({
  command: "delete <sessionID>",
  describe: "delete a session",
  builder: (yargs: Argv) => {
    return yargs.positional("sessionID", {
      describe: "session ID to delete",
      type: "string",
      demandOption: true,
    })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const sessionID = SessionID.make(args.sessionID)
      try {
        await AppRuntime.runPromise(Session.Service.use((svc) => svc.get(sessionID)))
      } catch {
        UI.error(`Session not found: ${args.sessionID}`)
        await Log.exit(1)
      }
      await AppRuntime.runPromise(Session.Service.use((svc) => svc.remove(sessionID)))
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Session ${args.sessionID} deleted` + UI.Style.TEXT_NORMAL)
    })
  },
})

export const SessionListCommand = cmd({
  command: "list",
  describe: "list sessions",
  builder: (yargs: Argv) => {
    return yargs
      .option("max-count", {
        alias: "n",
        describe: "limit to N most recent sessions",
        type: "number",
      })
      .option("format", {
        describe: "output format",
        type: "string",
        choices: ["table", "json"],
        default: "table",
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const sessions = [...Session.list({ roots: true, limit: args.maxCount })]

      if (sessions.length === 0) {
        if (process.stdout.isTTY) UI.println("No sessions found.")
        return
      }

      if (args.format === "json") {
        console.log(formatSessionJSON(sessions))
        return
      }

      if (process.stdout.isTTY) {
        await pickAndLaunch(sessions)
        return
      }

      console.log(formatSessionTable(sessions))
    })
  },
})

async function pickAndLaunch(sessions: Session.Info[]) {
  const options = [
    { label: "＋ New session", value: "new" },
    ...sessions.map((s) => ({
      label: `${Locale.truncate(s.title, 60)}  ${Locale.todayTimeOrDateTime(s.time.updated)}`,
      value: s.id,
    })),
  ]
  const result = await prompts.select({
    message: "Select a session to continue",
    options,
  })
  if (prompts.isCancel(result)) return
  await launchTui(result === "new" ? [] : ["--session", String(result)])
}

async function launchTui(args: string[]) {
  const bin = process.execPath
  const argv = Installation.isLocal() ? [process.argv[1] ?? "", ...args] : args
  const proc = Process.spawn([bin, ...argv], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  process.exitCode = await proc.exited
}

function formatSessionTable(sessions: Session.Info[]): string {
  const lines: string[] = []

  const maxIdWidth = Math.max(20, ...sessions.map((s) => s.id.length))
  const maxTitleWidth = Math.max(25, ...sessions.map((s) => s.title.length))

  const header = `Session ID${" ".repeat(maxIdWidth - 10)}  Title${" ".repeat(maxTitleWidth - 5)}  Updated`
  lines.push(header)
  lines.push("─".repeat(header.length))
  for (const session of sessions) {
    const truncatedTitle = Locale.truncate(session.title, maxTitleWidth)
    const timeStr = Locale.todayTimeOrDateTime(session.time.updated)
    const line = `${session.id.padEnd(maxIdWidth)}  ${truncatedTitle.padEnd(maxTitleWidth)}  ${timeStr}`
    lines.push(line)
  }

  return lines.join(EOL)
}

function formatSessionJSON(sessions: Session.Info[]): string {
  const jsonData = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    updated: session.time.updated,
    created: session.time.created,
    projectId: session.projectID,
    directory: session.directory,
  }))
  return JSON.stringify(jsonData, null, 2)
}
