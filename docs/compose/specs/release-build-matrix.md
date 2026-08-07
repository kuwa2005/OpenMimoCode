# Spec: リリースビルドの並列化 (build matrix) + リリースノウハウのドキュメント化・スクリプト化

Status: Approved
Date: 2026-08-06
Author: compose agent (SE mode)

## [S1] Background

ユーザー依頼: 「毎回リリースに手間取っていないか?」→ その後の指示で、「スキルにするほどではないが、迷わずビルドし、リリースまで進められるようにノウハウをドキュメントにまとめて、次からそれを参照するようにして。スクリプト化できるならスクリプト化も考慮して」。

TASK 6 で publish.yml (workflow_dispatch: version → build-cli → publish) を新設した直後の問いかけ。
現状のリリースの手間は主に 2 点:

1. **ビルドが遅い** — build-cli ジョブが **12 ターゲット (linux-arm64 / linux-x64 / linux-x64-baseline /
   linux-arm64-musl / linux-x64-musl / linux-x64-musl-baseline / darwin-arm64 / darwin-x64 /
   darwin-x64-baseline / windows-arm64 / windows-x64 / windows-x64-baseline) を単一ランナーで
   逐次ビルド** (packages/opencode/script/build.ts L210 の for ループ)。
2. **ノウハウが散在** — リリース手順 (シークレット設定、script/release の発火、ワークフロー各ジョブの
   意味、バージョン規則、チェックサム/インストーラー、npm/FDS 配布、トラブルシュート) がコードと過去の
   ドキュメントに分散しており、毎回確認に迷う。

## [S2] ヒアリングログ

### H1. どこを改善したいか (2026-08-06)

- **Question**: 「毎回リリースに手間取る」のどこを改善したいか?
- **Why asked**: ユーザーの問いは曖昧で、実害の所在 (ビルド時間 / 手動ステップ / 自動化深度) を特定する必要があった。
- **Background**: リリースカットは `script/release patch` の 1 コマンドで手順自体は最小。一方 build-cli は 12 ターゲットを 1 ジョブで逐次実行し時間がかかる。
- **Result**: **「ビルドが遅い」を選択** → GitHub Actions の build matrix で 12 ターゲットを並列化 (R1)。

### H2. 自動化の到達点 (2026-08-06)

- **Question**: 自動化の到達点はどこまでにしますか? (公開リリース・npm 公開は不可逆操作)
- **Why asked**: 自動化の上限を確定しないと publish job の finalize を維持するか手動ゲートを挟むかが決まらないため。
- **Background**: TASK 6 の Requirements Lock で「今すぐのリリースカットは実行しない (ワークフローは作るが発火はしない)」と決定済み。トリガーは手動 dispatch のまま。
- **Result**: **「公開まで自動」を選択** → 発火後の ビルド → アセット+SHA256SUMS → npm publish → finalize は CI が自動実行 (R4)。人間の操作はトリガーのみ。

### H3. ノウハウのドキュメント化 (2026-08-06)

- **Question**: (ユーザー自発指示) スキルにするほどではないが、迷わずビルドし、リリースまで進められるようにノウハウをドキュメントにまとめて、次からそれを参照するようにして。スクリプト化できるならスクリプト化も考慮。
- **Why asked**: なし (指示)。スキル化 (SKILL.md) は明示的に否定されたため、通常ドキュメント + スクリプト化で対応する。
- **Background**: リリース手順の知識がコード/過去ドキュメントに分散。毎回「どうやるんだっけ」となる。
- **Result**: **docs/RELEASING.md (日本語) にランブック化 (R5) + script/release のワンストップ化 (R6) + AGENTS.md/MEMORY.md からの参照 (R7)**。

### H4. script/release の範囲 (2026-08-06)

- **Question**: script/release の役割はどこまで拡張しますか?
- **Why asked**: 「スクリプト化できるなら」の範囲 (発火のみ / 監視込み / 品質ゲート込み) を確定するため。
- **Background**: 現状の script/release は `gh workflow run publish.yml` を叩くだけ。
- **Result**: **「全部入り」を選択** — プリフライト (gh 認証・シークレット・git 状態) → dispatch → run URL 表示 → 完了まで監視 (gh run watch) → 結果サマリ (R6)。品質ゲート (typecheck/test) は含めない (リリース時間が伸びるため)。

### H5. ドキュメントの場所・参照の仕組み (2026-08-06)

- **Question**: ランブックの場所/言語と、次回からの参照方法をどうするか? (2 問)
- **Why asked**: ドキュメントの置き場所と、将来セッションが確実に参照する仕組み (AGENTS.md / MEMORY.md / スキル) を確定するため。
- **Background**: スキル化はしない方針。AGENTS.md は全エージェントが必ず読む指示ファイル。MEMORY.md はプロジェクト記憶。
- **Result**: **docs/RELEASING.md 日本語 (R5) + AGENTS.md とプロジェクト MEMORY.md の両方に参照を記録 (R7)**。

## [S3] Goals

- G1: 12 ターゲットのビルドを GitHub Actions build matrix で並列化し、リリースビルドのウォールクロックを大幅短縮 (逐次 → 並列)。
- G2: リリース手順を docs/RELEASING.md (日本語) にランブックとして集約。迷わずビルド・リリースまで進められる。
- G3: script/release をワンストップコマンド化 (プリフライト → 発火 → 監視 → サマリ)。
- G4: 次回以降のセッションが AGENTS.md / MEMORY.md 経由でランブックを確実に参照する。
- G5: 公開まで自動 (トリガーは手動 dispatch) を維持。既存機能 (ローカル全ビルド・インストーラー) は後方互換。

## [S4] Non-goals

- リリーストリガーの自動化 (push 検知による自動カット) は行わない — 公開は不可逆。
- スキル化 (SKILL.md) は行わない — ユーザー指示により否定済み。
- ビルドスクリプト内部の並列化 (同一ランナー内 Promise.all) は行わない。
- インストーラー (install / install.ps1) の変更は不要 — アセット名・SHA256SUMS 形式は不変。
- script/release への品質ゲート (typecheck/test 実行) は含めない (H4)。

## [S5] 要件

- **R1 (build matrix)**: `.github/workflows/publish.yml` の build-cli を matrix 化。12 ターゲット × ubuntu-latest 並列。
  各ジョブは `MIMOCODE_TARGETS=<target>` で自分のターゲットのみビルド・アップロード。`publish` ジョブは
  `needs: [version, build-cli]` で全 matrix 完了を待つ。
- **R2 (build.ts ターゲット絞り込み)**: `MIMOCODE_TARGETS` env (カンマ区切り、ターゲット名 =
  `oimo-<os>-<arch>[-baseline][-musl]`、win32→windows) を追加。指定時は該当ターゲットのみビルド。
  未指定時は従来どおり全 12 ターゲット (後方互換)。ターゲット名計算を純関数 `targetName` に抽出して export。
- **R3 (SHA256SUMS 一元化)**: matrix ジョブは**アセットのみ**をアップロード (SHA256SUMS は生成しない)。
  publish ジョブが `gh release download` で全アセットを取得 → `bun script/checksums.ts` で aggregate
  SHA256SUMS を生成 → `gh release upload --clobber`。順序: チェックサム生成 → npm publish → finalize。
  ローカル全ビルド (MIMOCODE_TARGETS 未指定 + MIMOCODE_RELEASE) は従来どおり SHA256SUMS を build.ts 内で生成。
- **R4 (公開まで自動)**: publish ジョブは NPM_TOKEN 存在時 npm publish、常に `gh release edit --draft=false`
  (finalize)。トリガーは workflow_dispatch のみ (H2)。
- **R5 (ランブック)**: `docs/RELEASING.md` (日本語) を新規作成。必須セクション:
  概要 / 前提条件 (gh 認証、シークレット NPM_TOKEN・MIMO_FDS_AK・MIMO_FDS_SK とその省略時の挙動) /
  リリース手順 (script/release の使い方、bump と version 上書き) / ワークフロー各ジョブの動作 (version →
  build-cli (matrix) → publish) / バージョン決定規則 (MIMOCODE_BUMP / MIMOCODE_VERSION、bumpVersions による
  全 package.json 書換と commit/push、git とタグの整合性) / アセットと SHA256SUMS・インストーラー検証
  (OIMO_BASE_URL、404/エントリ無し=警告、不一致=中止) / npm per-platform 配布 (@mimo-ai/oimo-<platform>-<arch>) /
  FDS ミラー / トラブルシュート (シークレット未設定、タグ衝突、changelog 空、ビルド失敗、checksum mismatch)。
- **R6 (script/release 拡張)**: `script/release [major|minor|patch] [--version X.Y.Z] [--no-watch] [--help]`。
  - プリフライト: `gh` インストール+認証 (`gh auth status`) 確認、未コミット変更の警告、シークレット状況
    表示 (`gh secret list` から NPM_TOKEN / MIMO_FDS_AK / MIMO_FDS_SK の有無を警告)。
  - dispatch: `gh workflow run publish.yml -f bump=<type> [-f version=<ver>]` (--version 指定時)。
  - run URL 表示、`gh run watch` (--no-watch でスキップ)、完了後 `gh run view` でジョブ別結果、
    `gh release view v<ver>` でリリース URL を表示。
  - 最後に「手順の詳細は docs/RELEASING.md を参照」を表示。
- **R7 (将来参照)**: `AGENTS.md` に「リリース手順は docs/RELEASING.md を参照」を追記。プロジェクト
  MEMORY.md (## Rules) にも同じ参照を記録。
- **R8 (後方互換)**: 既存の release-installer.test.ts (T1–T7) が引き続き PASS。インストーラー・アセット名・
  SHA256SUMS 形式 (sha256sum -c 互換) は不変。

## [S6] テスト仕様

- **T1**: `targetName` 純関数単体 — 12 ターゲットの名前計算 (win32→windows、baseline/musl 接尾辞)。
- **T2**: ターゲット絞り込み純関数単体 — MIMOCODE_TARGETS 空=全 12 / 単一 / 複数カンマ区切り / 未知名の扱い。
- **T3**: publish.yml 静的 — matrix 12 エントリ、needs チェーン (version→build-cli→publish)、
  MIMOCODE_TARGETS 受け渡し、publish ジョブの SHA256SUMS 再生成 (`gh release download` + `checksums.ts` +
  `upload --clobber`)、finalize (`--draft=false`)、npm スキップガード。
- **T4**: build.ts 静的 — MIMOCODE_TARGETS 参照、matrix 時 (targets 指定時) に SHA256SUMS 生成をスキップする
  条件分岐の存在。
- **T5**: script/release 静的+挙動 — `--help` / `--no-watch` / プリフライト (gh 不在時の明示エラー) の分岐。
  (実行は gh に依存するため静的検証 + エラー系のみ実行)
- **T6**: docs/RELEASING.md 静的 — 必須セクション見出しの存在 (前提条件 / リリース手順 / ワークフロー /
  トラブルシュート)。
- **T7**: AGENTS.md 静的 — `docs/RELEASING.md` への参照行が存在。
- **T8**: 回帰 — `bun typecheck` PASS、既存 `release-installer.test.ts` PASS、`test/cli/` 回帰で新規失敗なし
  (既知 voice 4 件のみ)。

## [S7] 検証 (実機、テスト外)

- `MIMOCODE_TARGETS=linux-x64 bun packages/opencode/script/build.ts` で単一ターゲット実ビルド成功
  (MIMOCODE_RELEASE なし = アップロードなし) を確認し、matrix ジョブのビルドパスを実証。
- `script/release --help` / `script/release` (プリフライト失敗系: gh 認証なしでは中断しない — 警告のみ) の動作確認。
