import { EOL } from "os"
import { Effect, Stream } from "effect"
import { AppRuntime } from "../../../effect/app-runtime"
import { Ripgrep } from "../../../file/ripgrep"
import { Instance } from "../../../project/instance"
import { bootstrap } from "../../bootstrap"
import { cmd } from "../cmd"

export const RipgrepCommand = cmd({
  command: "rg",
  describe: "ripgrep デバッグ用ユーティリティ",
  builder: (yargs) => yargs.command(TreeCommand).command(FilesCommand).command(SearchCommand).demandCommand(),
  async handler() {},
})

const TreeCommand = cmd({
  command: "tree",
  describe: "ripgrep でファイルツリーを表示",
  builder: (yargs) =>
    yargs.option("limit", {
      type: "number",
    }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      const tree = await AppRuntime.runPromise(
        Ripgrep.Service.use((svc) => svc.tree({ cwd: Instance.directory, limit: args.limit })),
      )
      process.stdout.write(tree + EOL)
    })
  },
})

const FilesCommand = cmd({
  command: "files",
  describe: "ripgrep でファイルを一覧表示",
  builder: (yargs) =>
    yargs
      .option("query", {
        type: "string",
        description: "クエリでファイルを絞り込み",
      })
      .option("glob", {
        type: "string",
        description: "ファイルに一致させる glob パターン",
      })
      .option("limit", {
        type: "number",
        description: "結果数の上限",
      }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      const files = await AppRuntime.runPromise(
        Effect.gen(function* () {
          const rg = yield* Ripgrep.Service
          return yield* rg
            .files({
              cwd: Instance.directory,
              glob: args.glob ? [args.glob] : undefined,
            })
            .pipe(
              Stream.take(args.limit ?? Infinity),
              Stream.runCollect,
              Effect.map((c) => [...c]),
            )
        }),
      )
      process.stdout.write(files.join(EOL) + EOL)
    })
  },
})

const SearchCommand = cmd({
  command: "search <pattern>",
  describe: "ripgrep でファイル内容を検索",
  builder: (yargs) =>
    yargs
      .positional("pattern", {
        type: "string",
        demandOption: true,
        description: "検索パターン",
      })
      .option("glob", {
        type: "array",
        description: "ファイルの glob パターン",
      })
      .option("limit", {
        type: "number",
        description: "結果数の上限",
      }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      const results = await AppRuntime.runPromise(
        Ripgrep.Service.use((svc) =>
          svc.search({
            cwd: Instance.directory,
            pattern: args.pattern,
            glob: args.glob as string[] | undefined,
            limit: args.limit,
          }),
        ),
      )
      process.stdout.write(JSON.stringify(results.items, null, 2) + EOL)
    })
  },
})
