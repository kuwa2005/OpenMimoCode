# Spec: `--log` をファイル名なしで指定したときの挙動調査

Status: Approved (Requirements Lock 承認済み)
Date: 2026-08-06
Complexity: Low (調査のみ、実装なし)

## Hearing Log

| # | Question | Why asked | Background | Result |
|---|----------|-----------|------------|--------|
| H1 | 成果物は調査レポートのみか、修正案提示 or 実装まで含めるか | 依頼文言は「調査」だが、直前に `--auto` の修正タスクを実施しており、修正まで期待している可能性があるため | 調査自体は先行して完了済み。ソース解析と yargs 実測の両方で挙動を確認済み | 調査レポートのみ (修正はしない) |
| H2 | レポートの記録先 | SE モードは「ドキュメンタリー・エビデンスが成果物」であり、証跡をファイルとして残すか確認するため | compose_docs_dir の規定で reports は `docs/compose/reports/` | `docs/compose/reports/` に保存 |

## Requirements

### 目的

`oimo --log` を**ファイル名なし**で指定したときに実際に何が起こるかを、以下に基づき文書化する:

- ソース解析: フラグ定義 → middleware → env 伝搬 → TUI 消費側の全経路
- 実測: yargs 18.0.0 で CLI と同等のパース設定を使った複数パターンの実機テスト

### 調査項目 (必須カバー)

1. `--log` フラグの定義とヘルプ表示 (`packages/opencode/src/index.ts:99`) — `requiresArg` の有無
2. yargs パース挙動の実測 (素の `--log` / `--flag` 後続 / 位置引数後続 / `--log=` / 空文字引数 / コマンド後置)
3. ダウンストリーム挙動: `if (opts.log)` middleware → `MIMOCODE_LOG` → `sanitizedProcessEnv` での worker 伝搬 → `session-log.ts` の `appendSessionLog`
4. truthy にパースされた場合の失敗モード (例: ディレクトリを指した場合の EISDIR) とエラーハンドリング

### 成果物

- `docs/compose/reports/log-without-filename.md` — 調査結果レポート
- 実測に使ったスクリプトとその出力をレポート内に記載 (再現可能な証跡)

### テスト基準

調査タスクのため実装コードはない。検証は以下で担保する:

- 実測スクリプトの実行出力が本レポートの記載と一致すること (実測済み: 素の `--log` → `log: ""`、`--log run hello` → `log: "run"`)
- レポート内のソース参照 (ファイル:行番号) が実際のコードと一致すること

### Out of scope

- コードの修正・実装
- 修正方針の提案
