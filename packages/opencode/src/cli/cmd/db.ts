import type { Argv } from "yargs"
import { spawn } from "child_process"
import { Database } from "../../storage"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database as BunDatabase } from "bun:sqlite"
import { UI } from "../ui"
import { cmd } from "./cmd"
import { JsonMigration } from "../../storage"
import { EOL } from "os"
import { errorMessage } from "../../util/error"
import { Log } from "../../util"

const QueryCommand = cmd({
  command: "$0 [query]",
  describe: "対話型 sqlite3 シェルを開くか、クエリを実行する",
  builder: (yargs: Argv) => {
    return yargs
      .positional("query", {
        type: "string",
        describe: "実行する SQL クエリ",
      })
      .option("format", {
        type: "string",
        choices: ["json", "tsv"],
        default: "tsv",
        describe: "出力形式",
      })
  },
  handler: async (args: { query?: string; format: string }) => {
    const query = args.query as string | undefined
    if (query) {
      const db = new BunDatabase(Database.Path, { readonly: true })
      try {
        const result = db.query(query).all() as Record<string, unknown>[]
        if (args.format === "json") {
          console.log(JSON.stringify(result, null, 2))
        } else if (result.length > 0) {
          const keys = Object.keys(result[0])
          console.log(keys.join("\t"))
          for (const row of result) {
            console.log(keys.map((k) => row[k]).join("\t"))
          }
        }
      } catch (err) {
        UI.error(errorMessage(err))
        await Log.exit(1)
      }
      db.close()
      return
    }
    const child = spawn("sqlite3", [Database.Path], {
      stdio: "inherit",
    })
    await new Promise((resolve) => child.on("close", resolve))
  },
})

const PathCommand = cmd({
  command: "path",
  describe: "データベースのパスを表示する",
  handler: () => {
    console.log(Database.Path)
  },
})

const MigrateCommand = cmd({
  command: "migrate",
  describe: "JSON データを SQLite に移行する (既存データとマージ)",
  handler: async () => {
    const sqlite = new BunDatabase(Database.Path)
    const tty = process.stderr.isTTY
    const width = 36
    const orange = "\x1b[38;5;214m"
    const muted = "\x1b[0;2m"
    const reset = "\x1b[0m"
    let last = -1
    if (tty) process.stderr.write("\x1b[?25l")
    try {
      const stats = await JsonMigration.run(drizzle({ client: sqlite }), {
        progress: (event) => {
          const percent = Math.floor((event.current / event.total) * 100)
          if (percent === last) return
          last = percent
          if (tty) {
            const fill = Math.round((percent / 100) * width)
            const bar = `${"■".repeat(fill)}${"･".repeat(width - fill)}`
            process.stderr.write(
              `\r${orange}${bar} ${percent.toString().padStart(3)}%${reset} ${muted}${event.current}/${event.total}${reset} `,
            )
          } else {
            process.stderr.write(`sqlite-migration:${percent}${EOL}`)
          }
        },
      })
      if (tty) process.stderr.write("\n")
      if (tty) process.stderr.write("\x1b[?25h")
      else process.stderr.write(`sqlite-migration:done${EOL}`)
      UI.println(
        `Migration complete: ${stats.projects} projects, ${stats.sessions} sessions, ${stats.messages} messages`,
      )
      if (stats.errors.length > 0) {
        UI.println(`${stats.errors.length} errors occurred during migration`)
      }
    } catch (err) {
      if (tty) process.stderr.write("\x1b[?25h")
      UI.error(`Migration failed: ${errorMessage(err)}`)
      await Log.exit(1)
    } finally {
      sqlite.close()
    }
  },
})

export const DbCommand = cmd({
  command: "db",
  describe: "データベース ツール",
  builder: (yargs: Argv) => {
    return yargs.command(QueryCommand).command(PathCommand).command(MigrateCommand).demandCommand()
  },
  handler: () => {},
})
