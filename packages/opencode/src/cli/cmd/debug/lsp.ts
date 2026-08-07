import { LSP } from "../../../lsp"
import { AppRuntime } from "../../../effect/app-runtime"
import { Effect } from "effect"
import { bootstrap } from "../../bootstrap"
import { cmd } from "../cmd"
import { Log } from "../../../util"
import { EOL } from "os"

export const LSPCommand = cmd({
  command: "lsp",
  describe: "LSP デバッグ用ユーティリティ",
  builder: (yargs) =>
    yargs.command(DiagnosticsCommand).command(SymbolsCommand).command(DocumentSymbolsCommand).demandCommand(),
  async handler() {},
})

const DiagnosticsCommand = cmd({
  command: "diagnostics <file>",
  describe: "ファイルの診断情報を取得",
  builder: (yargs) => yargs.positional("file", { type: "string", demandOption: true }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      const out = await AppRuntime.runPromise(
        LSP.Service.use((lsp) =>
          Effect.gen(function* () {
            yield* lsp.touchFile(args.file, true)
            yield* Effect.sleep(1000)
            return yield* lsp.diagnostics()
          }),
        ),
      )
      process.stdout.write(JSON.stringify(out, null, 2) + EOL)
    })
  },
})

export const SymbolsCommand = cmd({
  command: "symbols <query>",
  describe: "ワークスペースのシンボルを検索",
  builder: (yargs) => yargs.positional("query", { type: "string", demandOption: true }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      using _ = Log.Default.time("symbols")
      const results = await AppRuntime.runPromise(LSP.Service.use((lsp) => lsp.workspaceSymbol(args.query)))
      process.stdout.write(JSON.stringify(results, null, 2) + EOL)
    })
  },
})

export const DocumentSymbolsCommand = cmd({
  command: "document-symbols <uri>",
  describe: "ドキュメントからシンボルを取得",
  builder: (yargs) => yargs.positional("uri", { type: "string", demandOption: true }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      using _ = Log.Default.time("document-symbols")
      const results = await AppRuntime.runPromise(LSP.Service.use((lsp) => lsp.documentSymbol(args.uri)))
      process.stdout.write(JSON.stringify(results, null, 2) + EOL)
    })
  },
})
