# Test Report: `--log` 出力モード (full/summary) と自動ファイル名

Status: Passed (2026-08-06; Rev 2: デフォルトを summary に変更 — ユーザー回答「デフォルトは summaryでよい」)
Spec: [log-mode-summary-auto-name](../specs/log-mode-summary-auto-name.md) (Approved, Rev 2)

## 検証サマリ

| 検証 | コマンド | 結果 |
|------|----------|------|
| Typecheck | `bun typecheck` (packages/opencode, tsgo --noEmit) | **PASS** |
| session-log 単体テスト | `bun test test/cli/tui/session-log.test.ts` | **13/13 PASS** (42 expect) |
| CLI テスト回帰 | `bun test test/cli/` | 334 PASS / 4 FAIL (事前存在の環境依存失敗、下記) |
| yargs パース確認 | 一時ハーネス (tmp-logmode-parse.mjs, 実行後に削除) | **期待どおり** (下表) |

## テスト仕様 (T1–T9) の実行結果

全 9 項目を session-log.test.ts に実装し実行。すべて **PASS**。

| # | テスト | 結果 |
|---|--------|------|
| T1 | formatSessionLogUser の形式 | PASS |
| T2 | formatSessionLogQA の形式 (multiple/custom/未回答含む) | PASS |
| T3 | formatSessionLogResult の形式 | PASS |
| T4 | generateSessionLogFileName のパターンと重複回避 (-1 付与) | PASS |
| T5 | resolveSessionLogFile (なし→undefined / auto→生成名 / explicit→そのまま) | PASS |
| T6 | summary フロー: assistant は書き込みなし → 次のユーザー入力で Result flush → User 追記。空テキストは無視、順序 (Result < User) 検証 | PASS |
| T7 | flushSessionLogResult は pending なしで no-op | PASS |
| T8 | full モード (MIMOCODE_LOG_MODE=full 明示) の既存挙動維持 + summary 専用レコードを無視 | PASS |
| T9 | 既定モード: MIMOCODE_LOG_MODE 未設定で summary が既定 (sessionLogMode()="summary"、record* が書き込む) | PASS |

## yargs パース実測 (ハーネス)

| 入力 | log | log-mode | 備考 |
|------|-----|----------|------|
| `oimo --log` | `""` | — | → MIMOCODE_LOG_AUTO=1 (自動ファイル名) |
| `oimo --log=foo.md` | `"foo.md"` | — | 従来どおり |
| `oimo --log foo.md` | `"foo.md"` | — | 従来どおり |
| `oimo --log run hello` | `"run"` | — | 既知の制限 (仕様 §4、対応外) |
| `oimo --log --log-mode summary` | `""` | `"summary"` | 自動名 + summary |
| `oimo --log-mode summary` | — | `"summary"` | |
| `oimo --log-mode bogus` | — | — | yargs choices エラー (期待どおり) |

## 既知の事前失敗 (今回の変更と無関係)

`test/cli/tui/voice.test.ts` の 4 件 (`transcribeAudio`/`processVoiceControl` × network error / custom model) が 5 秒タイムアウトで失敗。`git stash` で変更を退避したクリーンツリーでも同一 (33 pass / 4 fail) を確認済み。ネットワーク挙動依存の環境問題であり、本変更の影響ではない。

## 検証方法の補足

- 単体テストは `tmpdir` fixture + `process.env.MIMOCODE_LOG` / `MIMOCODE_LOG_MODE` の直接設定 (既存テストのパターンを踏襲)。
- sync.tsx のイベント配線 (question.asked/replied の対応付け、モード分岐) は TUI 実行が必要なため、単体テスト対象外。ロジック本体 (フォーマット・フラッシュ順序・ファイル解決) は session-log.ts に分離し、上記テストでカバー。パース層はハーネスで実測確認。
