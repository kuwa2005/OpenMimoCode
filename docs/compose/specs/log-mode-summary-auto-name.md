# Spec: `--log` 出力モード (full/summary) とファイル名省略時の自動保存

Status: Approved (Requirements Lock, 2026-08-06, headless; Rev 2: H2 をユーザー回答で修正 — デフォルト summary)
Date: 2026-08-06
Complexity: Medium
Related: [調査レポート: `--log` をファイル名なしで指定したときの挙動](../reports/log-without-filename.md)

## 背景

現状の `--log <file>` は、完了した各アシスタントターン (SE モードでは中間経過も含む多数のターン) をすべて markdown に追記するため、出力が過剰。ユーザーは以下だけを含むモードを希望:

- ユーザーが入力した内容
- システムからユーザーに出された質問と、ユーザーが回答した選択肢
- 最後にユーザーに出力された結果 (サマリー)

加えて、前回調査で判明した「`--log` をファイル名なしで指定するとサイレント no-op になる」問題を修正し、ファイル名省略時は自動で適切な名前のログファイルを作成する。

## Hearing Log

| # | Question | Why asked | Background | Result |
|---|----------|-----------|------------|--------|
| H1 | フラグ名は? | ユーザー案の `--loglevel` は既存の `--log-level` (内部ロガー用 DEBUG/INFO/WARN/ERROR, index.ts:86) と紛らわしいため | 既存 `--log-level` は今回の機能と無関係の別機能 | `--log-mode <full\|summary>` を採用 (自律決定: 衝突回避・意図明確) |
| H2 | デフォルトモードは? | 破壊的変更かどうかの確認 | 既存 `--log` は全ターン出力。当初 headless 決定は full (後方互換優先) | **summary をデフォルト** (ユーザー回答: 「デフォルトは summaryでよい」)。後方互換より使い勝手優先の明示要求。full は `--log-mode full` でオプトイン |
| H3 | 「最終結果」の粒度は? | 「最後にユーザーに出力する結果」の解釈が曖昧 | 1セッションで複数依頼を順に行うケース | 依頼サイクルごと (自律決定: 各依頼の成果が残る) |
| H4 | 自動保存先は? | ファイルの場所の好み | データディレクトリは見つけにくい | カレントディレクトリに `oimo-session-YYYYMMDD-HHMMSS.md` (自律決定: 発見容易性) |

## Requirements

### 1. 出力モードフラグ

- グローバルオプション `--log-mode <full|summary>` を追加 (index.ts、`--log` の隣)。`choices: ["full", "summary"]`、**既定 `summary`** (明示なしで summary モード。full は `--log-mode full` でオプトイン)。
- middleware で `process.env.MIMOCODE_LOG_MODE = opts.logMode` に設定。`Flag.MIMOCODE_LOG_MODE` getter を追加 (flag.ts)。値が `"full"` のときのみ full モード、それ以外 (未設定含む) は summary モード。

### 2. ファイル名省略時の自動保存

- 素の `--log` / `--log=` / `--log ""` (yargs は空文字列 `""` にパースする) を、**エラーにせず自動ファイル名**として扱う。
- middleware (index.ts:112): `opts.log === ""` のとき `process.env.MIMOCODE_LOG_AUTO = "1"` を設定 (MIMOCODE_LOG は設定しない)。`opts.log` が非空なら従来どおり `path.resolve(opts.log)`。
- TUI 側 (session-log.ts) で `MIMOCODE_LOG_AUTO` が立っている場合、**プロジェクトディレクトリ (= TUI プロセス cwd)** に `oimo-session-YYYYMMDD-HHMMSS.md` を生成して使う。既存同名ファイルがあれば `-1`, `-2`, … を付与して重複回避。
- ファイル解決はプロセス内でメモ化 (同一 env では同一ファイル)。env が変われば再解決 (テスト容易性)。

### 3. summary モードの出力内容

**`summary` が既定**。`full` モードは `--log-mode full` のオプトインで従来挙動を維持 (完了した assistant ターンごとに `### User` / `### oimo` を追記)。

`summary` モードでは以下 3 種類のみを追記:

| 種別 | 契機 | 形式 |
|------|------|------|
| ユーザー入力 | 実ユーザーメッセージ到着 (synthetic/ignored でない text を持つ) | `### User` + 本文 |
| 質問と回答 | `question.replied` イベント | `### Question` (質問文 + 選択肢) / `### Answer` (選択されたラベル) |
| 結果 | 依頼サイクル終了時 (次の実ユーザー入力 or TUI 終了) | `### Result` + 最終アシスタントテキスト |

- **依頼サイクル**: 実ユーザー入力 → (Q&A を挟みながら複数の assistant メッセージ) → 次の実ユーザー入力 or セッション終了、まで。サイクル中の最後の completed assistant テキストが Result になる (後続の assistant メッセージで上書き)。synthetic なユーザー境界メッセージ (checkpoint 等) ではフラッシュしない。
- **Q&A の対応付け**: `question.asked` で requestID → 質問内容を保持し、`question.replied` の answers と結合。rejected (破棄) は記録しない。選択肢は `label1 / label2 / ...`、回答は `, ` 連結 (custom 入力文字列も answers に含まれる)。未回答は `(no answer)`。
- 空テキストの User / Result は書き込まない。failed append は従来どおり warn のみ (best-effort)。
- **full モードには Q&A エントリを追加しない** (フルモードは既存挙動維持。質問文は assistant テキストに含まれる)。

### 4. 既知の制限 (対応しない)

- `oimo --log run hello` のような「`--log` の直後にコマンド名が続く」ケースは、yargs が `run` を値として消費する (調査レポート §2 参照)。値が空でないため自動名は発動せず、`<cwd>/run` というファイル名になる。これは yargs の任意引数パースの仕様であり、本対応のスコープ外とする (仕様として文書化)。

### 5. ヘルプ文言

- `--log`: ファイル名省略時に自動生成される旨を追記
- `--log-mode`: `what the --log file should contain (default: summary)`

## 設計 (実装方針)

- `session-log.ts` を拡張し、ロジックを TUI コンポーネントから分離して単体テスト可能にする:
  - `sessionLogMode(): "full" | "summary"` — env から (既定 summary。`"full"` のときのみ full)
  - `generateSessionLogFileName(dir, now): Promise<string>` — `oimo-session-<stamp>.md` + 重複回避
  - `resolveSessionLogFile({ explicit, auto, cwd }): Promise<string | undefined>` — 純関数 (auto 時は生成、explicit 時はそのまま、両方無ければ undefined)
  - `formatSessionLogUser / formatSessionLogQA / formatSessionLogResult` — markdown フォーマッタ
  - `recordSessionLogUser(text, time)` — pending Result を flush してから User を追記
  - `recordSessionLogQA(input)` — Q&A を追記
  - `recordSessionLogAssistant(text, time)` — pending Result を上書き (書き込みなし)
  - `flushSessionLogResult()` — pending Result を追記
  - 各関数は summary モードでないとき no-op。ファイル解決はメモ化。
- `sync.tsx`:
  - `question.asked` で `pendingQuestions.set(id, request)`、`question.replied` で対応付けして `recordSessionLogQA`
  - `maybeAppendSessionLog` をモード対応に: assistant completed → summary なら `recordSessionLogAssistant` / full なら現行 `appendSessionLog`。実ユーザーメッセージ → `flushSessionLogResult()` + `recordSessionLogUser` (synthetic は無視)
- `app.tsx` の `onBeforeExit` で `flushSessionLogResult()` を呼ぶ (セッション終了時の Result 確定)

## テスト仕様 (必須)

`packages/opencode/test/cli/tui/session-log.test.ts` を拡張 (tmpdir + env セットは既存パターンを踏襲):

| # | テスト | 期待 |
|---|--------|------|
| T1 | `formatSessionLogUser` | `### User` エントリの markdown 形式 |
| T2 | `formatSessionLogQA` | 質問文・選択肢・回答の形式 (multiple/custom 含む) |
| T3 | `formatSessionLogResult` | `### Result` エントリの形式 |
| T4 | `generateSessionLogFileName` | パターン `oimo-session-YYYYMMDD-HHMMSS.md` と、同名存在時の `-1` 付与 |
| T5 | `resolveSessionLogFile` | undefined(ログなし)→undefined / auto→生成名 / explicit→そのまま |
| T6 | summary フロー (env: MIMOCODE_LOG + MIMOCODE_LOG_MODE=summary) | user → assistant → user の順で flush 順序 (Result が前サイクルの最終回答、その後 User)。flush 前は assistant の書き込みなし |
| T7 | `flushSessionLogResult` | pending があるときのみ書き込み、空なら no-op |
| T8 | full モード (MIMOCODE_LOG_MODE=full 明示) | summary 専用レコード (record*) は no-op。appendSessionLog の 2 ターン追記は引き続き成功 |
| T9 | 既定モード | MIMOCODE_LOG_MODE 未設定で summary が既定 (record* が書き込み、sessionLogMode() が "summary" を返す) |

検証コマンド: `bun typecheck` と `bun test test/cli/tui/session-log.test.ts` (packages/opencode 配下から実行)。結果を `docs/compose/reports/log-mode-summary-auto-name-test.md` に記録。

## Out of scope

- 既知の制限 (§4) の修正
- `oimo run` (非 TUI) での --log 対応
- full モードへの Q&A 追加
- ドキュメント (HTML help) の更新
