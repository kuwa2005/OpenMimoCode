# Spec: CLI --help 全面改定・日本語化 (+ session list フラグ対応)

Status: Approved (Requirements Lock, 2026-08-06, headless)
Date: 2026-08-06
Related: [log-mode-summary-auto-name](log-mode-summary-auto-name.md) (--log 関連, 別タスク)

## 背景

- 現在の `--help` は全コマンド (~31 ファイル、describe 約 150 件) の文言が英語。yargs の見出し (Commands:/Options:) や型表示 ([boolean]) も英語。
- ユーザー依頼: 「--helpを全面改定。日本語化して」。
- 併せて前回報告「`oimo session list -c --auto --se` ができなかった」の原因: `session list` は `-n/--max-count` と `--format` しか持たず、`.strict()` により未知フラグ (`-c`/`--auto`/`--se`) はエラー → ヘルプ表示で何も起きない。`-c`(--continue)/`--auto`/`--se`(--autonomy) は TUI コマンド (`oimo [project]`) のオプション。
- 技術検証済み: yargs 18.0.0 は `.locale("ja")` で見出し・型表示を日本語化できる (esm shim が `yargs/locales` を参照、updateFiles=false)。スモークテストで実証: `コマンド:`/`オプション:`/`[真偽]`/`[文字列]`。ja.json に検証メッセージ訳も全て存在 (`未知の引数です: %s` / `オプションではない引数が %s 個では不足しています…` / `不正な値です:` / `必須の引数が見つかりません: %s` / `ヘルプを表示` / `バージョンを表示`)。

## ヒアリングログ

| # | 質問 | 背景 | 結果 |
|---|------|------|------|
| H1 | 対象範囲は? | 全面改定の範囲を確定 | **全コマンド + グローバルオプション** (自律決定: 全面 = 全て。翻訳は機械的で大規模だが単純) |
| H2 | どこまで日本語化? | yargs 見出しの扱い | **完全日本語化** — `.locale("ja")` で見出し・型表示も日本語 (自律決定: スモークテストで実証済み、低リスク) |
| H3 | 全面改定の内容 | 翻訳のみか、記述改善もか | **翻訳 + 記述改善** — 曖昧なオプション (--se/--auto/--log/--log-mode 等) の説明を明確化、usage 行と使用例 (.example) 追加、未知フラグ時のエラー表示改善 (自律決定) |
| H4 | session list フラグ対応を今回に含める? | 前回報告の未対応事項 | **含める** — `-c`/`--auto`/`--se` を `session list` に追加し TUI 起動時に転送 (自律決定: 同一 CLI 面の改善で一貫性が取れる) |

## 要件

- R1. 全コマンドの `describe` (コマンド・オプション・位置引数) とグローバルオプションの文言を日本語化。翻訳に留まらず、意味が不明確なものは説明を改善 (例: `--se` → SE 自律モード、`--auto` → 自動許可+信頼プロンプトスキップ)。
- R2. yargs を `.locale("ja")` に設定し、見出し (`コマンド:`/`オプション:`/`例:`/`位置:`)・型表示 (`[真偽]`/`[文字列]`/`[数値]`)・検証エラーメッセージも日本語化。
- R3. `--help`/`--version` の説明は ja ロケールの翻訳 (`ヘルプを表示`/`バージョンを表示`) を利用 (index.ts の明示 msg を削除)。
- R4. `.usage("oimo <コマンド> [オプション]")` に変更し、`.example()` で使用例 (日本語) を追加。
- R5. `.fail()` の判定を日本語メッセージプレフィックスに更新。未知引数/引数不足/不正値のとき: エラーメッセージ + ヒント (`oimo --help` 参照) を表示してからヘルプ表示、exit 1。
- R6. `session list` に `-c/--continue`, `--auto`, `--se/--autonomy` を追加。
  - TTY で `-c` なし: ピッカーで選択したセッション (または New session) を `--auto`/`--se` 付きで TUI 起動。
  - TTY で `-c`: ピッカーをスキップし、直近のセッションを `--continue` + フラグ付きで起動。セッションが 0 件ならエラーメッセージ + exit 1。
  - 非 TTY: 従来どおりテーブル/JSON 出力 (`-c`/`--auto`/`--se` は無視)。
- R7. 英語ヘルプは廃止し常に日本語 (ロケール切替オプションは追加しない)。
- R8. 既存のコマンド・フラグの挙動は変更しない (文言のみ)。既存テストが文言に依存していれば更新。

## 設計

### index.ts
- チェーン先頭付近に `.locale("ja")` を追加。
- `.help("help")` / `.version("version", InstallationVersion)` — msg 引数を削除 (ja ロケールの `ヘルプを表示`/`バージョンを表示` を利用)。
- `.usage("")` → `.usage("oimo <コマンド> [オプション]")`。
- `.example()` を 4 件追加 (TUI 起動 / -c --auto --se 続行 / run / session list)。
- グローバルオプションの describe を日本語化 (print-logs, log-level, pure, tor, log, log-mode)。
- `.completion("completion", "シェルの補完スクリプトを生成")`。
- `.fail()`: 日本語プレフィックス (`未知の引数です` / `オプションではない引数が` / `不正な値です`) 判定 → エラー文言 + ヒント行を stderr へ → `cli.showHelp(show)` → exit 1。err がある場合は従来どおり throw。

### コマンドファイル (31)
- 各 `describe` を日本語へ。代表的な明確化:
  - `--auto` (thread.ts): 「自動でパーミッションを承認 (dangerous)。ワークスペース信頼プロンプトもスキップ」
  - `--se`/`--autonomy` (thread.ts): 「SE 自律モード (ヒアリング→要件ロック→自律実装) で起動」
  - `--log` (index.ts): 「TUI セッションの質問と要約をマークダウンに追記 (ファイル名省略時は oimo-session-<タイムスタンプ>.md を自動生成)」
  - `--log-mode` (index.ts): 「--log ファイルの内容 (既定: summary)」

### session.ts
- `SessionListCommand.builder` に 3 オプション追加 (R6)。
- `launchFlags(args)` ヘルパー: `{auto?, autonomy?}` → `["--auto", "--se"]` を返す (純関数・単体テスト対象)。
- `pickAndLaunch(sessions, flags)`: `launchTui(result === "new" ? flags : ["--session", result, ...flags])`。
- handler: TTY かつ `args.continue` → `launchTui(["--continue", ...flags])`。
- 文言: describe + 実行時メッセージ (「セッションが見つかりません。」等) も日本語化。

## テスト仕様

新規 test/cli/help.test.ts。スパウンテストは `MIMOCODE_HOME=<tmpdir>` (data=<home>/data) + `MIMOCODE_DISABLE_CLAUDE_IMPORT=1` で分離し、`Bun.spawn([process.execPath, "src/index.ts", ...args], {cwd: packages/opencode})` で実行。

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 静的完全性: `src/cli/cmd/**/*.{ts,tsx}` と `src/index.ts` の全 `describe:` リテラルが日本語文字 (かな/漢字) を含む | 0 件の残留英語 (regex 走査) |
| T2 | スパウン `--help` | exit 0、stderr に `コマンド:` `オプション:` と日本語コマンド説明を含む、`Commands:` を含まない |
| T3 | スパウン `run --help` / `session --help` / `tui --help` | 各 exit 0、stderr に `オプション:` とそのコマンド固有の日本語文言 |
| T4 | スパウン `session list --bogus` | exit 1、stderr に `未知の引数です` とヒント (oimo --help) を含む |
| T5 | スパウン `session list -c --auto --se` (非 TTY, 空 DB) | exit 0、stderr にヘルプを含まない (フラグがパースされる) |
| T6 | 単体: `launchFlags({auto:true,autonomy:true})` | `["--auto","--se"]` / 各 false は空配列 |
| T7 | 回帰: 既存 session-log テスト + `bun typecheck` | 全パス (文言依存の失敗があれば修正) |

## 対象外

- TUI 内部の i18n (既に ja 対応)、Web/App、英語ヘルプの併存、`--lang` による切替。
- `.fail()` 以外のエラー文言の全面日本語化 (FormatError 等は既存のまま)。
- `session list` への他フラグ (--agent/--model/--fork 等) の転送 (今回は入力された 3 つのみ)。
