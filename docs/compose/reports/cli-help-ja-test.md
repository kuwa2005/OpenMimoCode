# Report: CLI --help 全面改定・日本語化 (+ session list フラグ対応)

Status: Complete
Date: 2026-08-06
Spec: [cli-help-ja](../specs/cli-help-ja.md) (Rev 1, Approved at Requirements Lock 2026-08-06, headless)

## Summary

`--help` を全面日本語化し、記述を改善した。yargs 18 を `.locale("ja")` に設定し、見出し・型表示・検証エラーも日本語化。全 ~31 コマンド ファイル + グローバル オプションの describe (~150 件) を翻訳 + 明確化。usage 行・使用例 (例: セクション)・`.fail()` のエラー表示 (メッセージ + ヒント) を追加。併せて `oimo session list -c --auto --se` の失敗 (TASK 4) を修正 — `session list` に `-c/--continue`・`--auto`・`--se/--autonomy` を追加し、TTY 起動時に TUI へフラグ転送する。

## 実装内容

### index.ts
- `.locale("ja")` 追加 (yargs 見出し/型表示/検証エラーを日本語化)
- `.help("help")` / `.version("version", ...)` — 明示 msg 削除 → ja ロケール訳 (`ヘルプを表示` / `バージョンを表示`) を利用
- `.usage("oimo <コマンド> [オプション]")` + `.example()` 4 件 (TUI 起動 / -c --auto --se 続行 / run / session list)
- グローバル オプション describe 日本語化 (print-logs, log-level, pure, tor, log, log-mode)
- `.completion` describe 日本語化
- `.fail()`: 判定を日本語プレフィックス (`未知の引数です` / `オプションではない引数が` / `不正な値です`) に更新。マッチ時: エラー メッセージ (danger bold) + ヒント (`oimo --help` 参照) を stderr に表示 → `showHelp` → exit 1

### コマンド ファイル (~30)
- 全 describe を日本語へ。代表的な明確化: `--auto` (自動承認 + ワークスペース信頼プロンプト スキップ)、`--se/--autonomy` (SE 自律モードの説明)、`--log` (自動ファイル名)、`--log-mode` (既定: summary)、`--never-ask`、`--fork`、`--dangerously-skip-permissions` 等
- 対象: run, tui/thread, tui/attach, session, account, mcp, providers, agent, db, network (serve/web/run 共有), debug/* (9), stats, github, plug, acp, uninstall, models, upgrade, export, import, pr, serve, web (batch A/B サブエージェント委譲 + 自前編集)

### session.ts (TASK 4 修正)
- `SessionListCommand` に `-c/--continue`・`--auto`・`--se/--autonomy` を追加 (describe は日本語)
- `launchFlags(args)` ヘルパー (export): `{auto, autonomy}` → `["--auto", "--se"]`
- TTY: `-c` → `launchTui(["--continue", ...flags])` (ピッカーなし); それ以外 → ピッカーで選択したセッションへ `["--session", id, ...flags]` / New session は `flags` のみ転送
- 非 TTY: 従来どおり table/JSON 出力 (`-c` は無視)。セッション 0 件 + `-c` + TTY のみエラー exit 1

## テスト結果

新規: `packages/opencode/test/cli/help.test.ts` (6 tests)。スパウン統合テストは `MIMOCODE_HOME=<tmpdir>` + `MIMOCODE_DISABLE_CLAUDE_IMPORT=1` で分離。

| # | テスト | 結果 |
|---|--------|------|
| T1 | 静的完全性: src/cli/cmd + network.ts + index.ts の全 describe リテラルが日本語文字を含む | ✅ PASS (37 ファイル走査) |
| T2 | スパウン `oimo --help` → コマンド:/オプション:/例: 見出し + 日本語コマンド説明、`Commands:` なし、exit 0 | ✅ PASS |
| T3 | スパウン `run --help` / `session list --help` / `tui --help` → 日本語 (run の format 説明、list の新フラグ説明、TUI 起動説明) | ✅ PASS |
| T4 | スパウン `session list --bogus` → `未知の引数です: bogus` + ヒント + exit 1 | ✅ PASS |
| T5 | スパウン `session list -c --auto --se` (非 TTY) → exit 0、ヘルプ非表示 | ✅ PASS |
| T6 | 単体 `launchFlags` 4 ケース | ✅ PASS |

実行 (3 回): **6/6 PASS ×3** (`bun test --timeout 30000 test/cli/help.test.ts`、~60s。テストは package.json の `--timeout 30000` 前提 — 素の `bun test` は 5s デフォルトで T3 がタイムアウトするため、スパウンテストには `--timeout` 必須)。

### 回帰
- `bun typecheck` (tsgo --noEmit): ✅ PASS
- `bun test --timeout 30000 test/cli/` (52 ファイル): **341 pass / 4 fail** — 4 件は全て既知の `voice` ネットワーク エラー テスト (タイムアウト、環境要因、クリーン ツリーでも再現済みの既存問題。本タスクと無関係)。プラグイン関連のエラー ログは表示されたが失敗テストには含まれず (フレーク)。
- 英語文言に依存する既存テスト: なし (grep 確認)

## 手動確認 (代表出力)

```
$ oimo --help
oimo <コマンド> [オプション]

コマンド:
  oimo completion          シェルの補完スクリプトを生成する
  oimo mcp                 MCP (Model Context Protocol) サーバーを管理する
  oimo [project]           oimo TUI を起動する                                          [デフォルト]
  oimo run [message..]     メッセージを渡して oimo を実行する
  oimo session             セッションを管理する
  ...

オプション:
  -h, --help  ヘルプを表示    [真偽]
      --auto  明示的に拒否されていないパーミッションを自動承認する (危険!)。ワークスペース信頼プロンプトもスキップする    [真偽]

例:
  oimo                       TUI を起動する
  oimo -c --auto --se        最後のセッションを自動許可 + SE 自律モードで続行する
  oimo run "バグを修正して"  ヘッドレスで 1 回のプロンプトを実行する
  oimo session list          セッションの一覧を表示する

$ oimo session list --bogus
未知の引数です: bogus
ヒント: `oimo --help` でコマンドとオプションを確認できます。
oimo session list
...
```

## 知見・注意

- `oimo tui --help` はトップレベル ヘルプにフォールバックする (tui は `$0 [project]` 既定コマンドでサブコマンドではない)。yargs の既存挙動。
- `session --help` は親コマンドのヘルプ (list/delete/import-claude の一覧) を表示し、`-c/--auto/--se` は `session list --help` 側に表示される。
- attach.ts の `description: "directory to run in"` は yargs が無視するキー (help に非表示) のため意図的に据え置き (修正するとヘルプに新規行が追加される = 挙動変更になるため対象外)。
- スパウンテストは毎回 JSON→SQLite マイグレーションが走る (~2-3s/回)。oimo.db マーカー事前作成でスキップ可能だが、T5 は Session.list 用に実 DB が必要なため非採用。
- 委譲した 2 サブエージェント (batch A: debug/* 等 13 ファイル 56 件、batch B: 8 ファイル 21 件) は typecheck PASS を確認済みで、git diff は describe 文字列のみの変更。

## 変更ファイル

- src: packages/opencode/src/index.ts, cli/network.ts, cli/cmd/{run,session,account,mcp,providers,agent,db,uninstall,models,upgrade,export,import,pr,serve,web,stats,github,plug,acp}.ts, cli/cmd/debug/{index,agent,config,file,lsp,ripgrep,scrap,skill,snapshot}.ts, cli/cmd/tui/{thread,attach}.ts
- テスト: packages/opencode/test/cli/help.test.ts (新規)
- ドキュメント: docs/compose/specs/cli-help-ja.md (新規, Approved)
