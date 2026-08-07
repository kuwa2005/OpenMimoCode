# 調査レポート: `--log` をファイル名なしで指定したときの挙動

- Date: 2026-08-06
- 対象: Open Mimo Code (oimo) CLI / TUI
- Spec: [docs/compose/specs/log-no-filename-investigation.md](../specs/log-no-filename-investigation.md)
- 結論サマリ: **素の `oimo --log` は完全なサイレント no-op** (エラー・警告・ファイル作成のいずれも発生しない)。ただし後続にトークンがある場合はそのトークンを値として飲み込み、コマンドが誤解釈される。

## 1. 調査対象の仕組み

`--log` は「TUI セッションの各ユーザー発言とアシスタント回答を markdown ファイルに追記する」グローバルフラグ。経路は以下の 4 段階:

```
index.ts フラグ定義
  → middleware で MIMOCODE_LOG に設定 (path.resolve 済み)
  → sanitizedProcessEnv で TUI worker へ env 伝搬
  → TUI sync.tsx がターン完了時に session-log.ts の appendSessionLog を呼ぶ
```

| 段階 | 箇所 | 内容 |
|------|------|------|
| フラグ定義 | `packages/opencode/src/index.ts:99` | `.option("log", { describe, type: "string" })` — **`requiresArg` なし** |
| middleware | `packages/opencode/src/index.ts:112-113` | `if (opts.log) process.env.MIMOCODE_LOG = path.resolve(opts.log)` |
| env 参照 | `packages/opencode/src/flag/flag.ts:71` | `get MIMOCODE_LOG() { return process.env["MIMOCODE_LOG"] }` |
| worker 伝搬 | `packages/opencode/src/util/mimo-process.ts:19` | `sanitizedProcessEnv` は `process.env` 全体をコピー → `MIMOCODE_LOG` も継承 |
| 消費側 | `packages/opencode/src/cli/cmd/tui/context/sync.tsx:374` | 完了した assistant ターンごとに `appendSessionLog` を呼ぶ |
| 書き込み | `packages/opencode/src/cli/cmd/tui/session-log.ts:26-32` | `file` が falsy なら即 return。それ以外は mkdir → appendFile (失敗時は warn のみ) |

## 2. yargs のパース挙動 (実測)

CLI と同等の設定 (`parserConfiguration({ "populate--": true })` + `.strict()` + string 型 `--log`、`requiresArg` なし) で yargs 18.0.0 を実測。

| コマンドライン | `log` の値 | その他の結果 | 備考 |
|---|---|---|---|
| `oimo --log` | `""` (空文字列) | — | **サイレント no-op になる** |
| `oimo --log --model x` | `""` | — | 後続の `--flag` は値として消費しない |
| `oimo --log tui` | `"tui"` | `_`: `[]` | **後続のトークンを値として消費** (tui はサブコマンドではなく default コマンドなので TUI 起動自体は続行) |
| `oimo --log run hello` | `"run"` | `project: "hello"` | **`run` コマンドが飲み込まれる**。`hello` が TUI の project 位置引数になる (コマンド誤解釈) |
| `oimo --log=` | `""` | — | 空文字 |
| `oimo --log ""` | `""` | — | 空文字 |
| `oimo run hello --log` | `""` | `run` 正常、`message: ["hello"]` | コマンドの後ろに置けば影響なし |
| `oimo --log -- file.md` | `""` | — | `--` でも回避不可 (以降のトークンはコマンド位置引数) |

再現スクリプト (bun, packages/opencode 配下で実行):

```js
import yargs from "yargs"

const mk = () => yargs([])
  .parserConfiguration({ "populate--": true })
  .scriptName("oimo")
  .usage("")
  .option("log", { describe: "x", type: "string" })
  .command("$0 [project]", "start oimo tui", (y) => y.option("model", { type: "string" }).positional("project", { type: "string" }))
  .command("run [message...]", "run a prompt", (y) => y.positional("message", { type: "string" }))
  .strict()
  .fail((msg, err) => { if (err) throw err; console.log("FAIL:", msg); process.exitCode = 1 })

for (const argv of [["--log"], ["--log", "--model", "x"], ["--log", "tui"], ["--log", "run", "hello"], ["--log="], ["--log", ""], ["run", "hello", "--log"], ["--log", "--", "file.md"]]) {
  const res = await mk().parse(argv)
  console.log(JSON.stringify(argv), "=> log:", JSON.stringify(res.log), "| _:", JSON.stringify(res._), "| project:", JSON.stringify(res.project), "| message:", JSON.stringify(res.message))
}
```

実行出力 (2026-08-06 実測、2 回とも同一結果):

```
["--log"] => log: "" | _: [] | project: undefined | message: undefined
["--log","--model","x"] => log: "" | _: [] | project: undefined | message: undefined
["--log","tui"] => log: "tui" | _: [] | project: undefined | message: undefined
["--log","run","hello"] => log: "run" | _: [] | project: "hello" | message: undefined
["--log="] => log: "" | _: [] | project: undefined | message: undefined
["--log",""] => log: "" | _: [] | project: undefined | message: undefined
["run","hello","--log"] => log: "" | _: ["run"] | project: undefined | message: ["hello"]
["--log","--","file.md"] => log: "" | _: [] | project: undefined | message: undefined
```

## 3. ダウンストリーム挙動

### 3.1 `log` が `""` (素の `--log`、`--log=`、`--log ""`)

1. `index.ts:112` の `if (opts.log)` は空文字列で **falsy** → `MIMOCODE_LOG` は**設定されない**。
2. `session-log.ts:27` の `Flag.MIMOCODE_LOG` は `undefined` → `appendSessionLog` は `Promise.resolve()` で即 return。
3. **結果: ファイル作成も、エラーも、警告も一切発生しない。完全にサイレント no-op。**
   - `--log` が指定された形跡すら残らない (ログの `args` には残るが、動作上の影響はゼロ)。

### 3.2 `log` が truthy でディレクトリ等を指す場合 (`--log tui` → `<cwd>/tui`)

1. `MIMOCODE_LOG = path.resolve("tui")` = `<cwd>/tui` (ディレクトリ)。
2. `session-log.ts:30` の `mkdir(path.dirname(file), { recursive: true })` は親ディレクトリなので成功。
3. `session-log.ts:31` の `appendFile(file, ...)` は EISDIR で失敗。
4. `session-log.ts:32` の `.catch` が捕捉し `log.warn("append failed", { file, error })` を出すだけ。**TUI は継続** (best-effort 設計)。

### 3.3 正常系 (`--log foo.md`)

設計どおり: 完了した assistant ターンごとに markdown が `foo.md` へ追記される (`formatSessionLogEntry`、同一アシスタントメッセージは `loggedTurns` Set で二重書き込み防止)。

## 4. 考察 (報告のみ、修正提案は本調査のスコープ外)

- ヘルプ表示 (`oimo --help`) では `--log` に `<file>` プレースホルダーが付かない (`requiresArg` なし)。引数が必須であることがユーザーに伝わらない。
- 素の `--log` がエラーにならず静かに no-op になるのは、ユーザーに「ログが取れている」と誤認させる危険がある。
- `oimo --log run hello` のケースは、引数なし指定の副次効果として**コマンド名が値に飲み込まれる**ため、意図と異なる動作 (TUI 起動 + ディレクトリ誤解釈) になる。

## 5. 検証

- 実測スクリプト: §2 の通り 2 回実行し同一出力 (素の `--log` → `log: ""`、`--log run hello` → `log: "run"`)。
- ソース参照の行番号はすべて grep で実コードと一致確認済み (§1 表)。
- 実装コードの変更なし (調査のみ)。
