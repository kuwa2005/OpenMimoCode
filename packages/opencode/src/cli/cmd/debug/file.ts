import { EOL } from "os"
import { AppRuntime } from "@/effect/app-runtime"
import { File } from "../../../file"
import { Ripgrep } from "@/file/ripgrep"
import { bootstrap } from "../../bootstrap"
import { cmd } from "../cmd"

const FileSearchCommand = cmd({
  command: "search <query>",
  describe: "クエリでファイルを検索",
  builder: (yargs) =>
    yargs.positional("query", {
      type: "string",
      demandOption: true,
      description: "検索クエリ",
    }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      const results = await AppRuntime.runPromise(File.Service.use((svc) => svc.search({ query: args.query })))
      process.stdout.write(results.join(EOL) + EOL)
    })
  },
})

const FileReadCommand = cmd({
  command: "read <path>",
  describe: "ファイル内容を JSON として読み込む",
  builder: (yargs) =>
    yargs.positional("path", {
      type: "string",
      demandOption: true,
      description: "読み込むファイルパス",
    }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      const content = await AppRuntime.runPromise(File.Service.use((svc) => svc.read(args.path)))
      process.stdout.write(JSON.stringify(content, null, 2) + EOL)
    })
  },
})

const FileStatusCommand = cmd({
  command: "status",
  describe: "ファイルのステータス情報を表示",
  builder: (yargs) => yargs,
  async handler() {
    await bootstrap(process.cwd(), async () => {
      const status = await AppRuntime.runPromise(File.Service.use((svc) => svc.status()))
      process.stdout.write(JSON.stringify(status, null, 2) + EOL)
    })
  },
})

const FileListCommand = cmd({
  command: "list <path>",
  describe: "ディレクトリ内のファイルを一覧表示",
  builder: (yargs) =>
    yargs.positional("path", {
      type: "string",
      demandOption: true,
      description: "一覧表示するファイルパス",
    }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      const files = await AppRuntime.runPromise(File.Service.use((svc) => svc.list(args.path)))
      process.stdout.write(JSON.stringify(files, null, 2) + EOL)
    })
  },
})

const FileTreeCommand = cmd({
  command: "tree [dir]",
  describe: "ディレクトリツリーを表示",
  builder: (yargs) =>
    yargs.positional("dir", {
      type: "string",
      description: "ツリー表示するディレクトリ",
      default: process.cwd(),
    }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      const tree = await AppRuntime.runPromise(Ripgrep.Service.use((svc) => svc.tree({ cwd: args.dir, limit: 200 })))
      console.log(JSON.stringify(tree, null, 2))
    })
  },
})

export const FileCommand = cmd({
  command: "file",
  describe: "ファイルシステムのデバッグ用ユーティリティ",
  builder: (yargs) =>
    yargs
      .command(FileReadCommand)
      .command(FileStatusCommand)
      .command(FileListCommand)
      .command(FileSearchCommand)
      .command(FileTreeCommand)
      .demandCommand(),
  async handler() {},
})
