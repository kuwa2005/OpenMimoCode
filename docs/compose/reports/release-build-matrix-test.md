# Report: リリースビルドの並列化 (build matrix) + リリースノウハウのドキュメント化・スクリプト化

- 日付: 2026-08-06
- Spec: docs/compose/specs/release-build-matrix.md (Requirements Lock Approved 2026-08-06)
- 状態: **実装完了・検証済み**

## 概要

ユーザー依頼「毎回リリースに手間取っていないか?」と続く指示「迷わずビルドし、リリースまで進められるように
ノウハウをドキュメントにまとめて、次からそれを参照するようにして。スクリプト化できるならスクリプト化も考慮」に
応え、以下を実装した。

1. **build matrix 並列化** — publish.yml の build-cli を 12 ターゲットの並列ジョブ化 (ウォールクロック短縮)。
2. **リリースランブック** — docs/RELEASING.md (日本語) 新規作成。
3. **script/release ワンストップ化** — プリフライト → 発火 → 監視 → サマリ。
4. **将来参照の仕組み** — AGENTS.md + プロジェクト MEMORY.md (## Rules) に参照を記録。

スキル化 (SKILL.md) はユーザー指示により行わない。

## 実装内容

### 1. packages/opencode/script/targets.ts (NEW)

12 ターゲット定義と名前計算を一元化した純関数モジュール (副作用なし、テストから直接 import 可能)。

- `ALL_TARGETS: Target[]` — 12 ターゲット (linux/darwin/win32 × arm64/x64 × baseline/musl)。
- `targetName(item)` — アセット名計算。**接尾辞順は baseline → musl** (例: `oimo-linux-x64-baseline-musl`)。
  実リリースのアセット名と一致させるため、元 build.ts の順序を維持 (インストーラー依存のため不変)。
- `filterTargets(targets, filter)` — `MIMOCODE_TARGETS` の絞り込み。`oimo-` プレフィックス付き・無しの
  両形式を受け付ける (`oimo-linux-x64` / `linux-x64`)。空フィルタなら全ターゲット (後方互換)。

### 2. packages/opencode/script/build.ts (編集)

- インラインの allTargets 配列と名前計算を削除し、targets.ts の import に置換。
- `MIMOCODE_TARGETS` env を追加。`singleFlag` でない場合、`filterTargets(allTargets, targetFilter)` で
  絞り込み (未指定 = 従来どおり全 12 ターゲット)。
- リリースアップロード: `targetFilter.length === 0` (全ビルド) のときのみ SHA256SUMS を build.ts 内で生成。
  matrix ジョブはアセットのみアップロード (SHA256SUMS は publish ジョブで一元生成 — 分散ビルドの競合回避)。

### 3. .github/workflows/publish.yml (編集)

```
version (バージョン決定・bump・push・ドラフト作成)
   ↓
build-cli: strategy.matrix.target × 12 (ubuntu-latest 並列、fail-fast: false)
   各ジョブ: MIMOCODE_TARGETS=${{ matrix.target }} で 1 ターゲットのみビルド+アップロード (+FDS)
   ↓
publish: gh release download --pattern 'oimo-*' → checksums.ts で集約 SHA256SUMS 生成 → upload --clobber
        → npm publish (NPM_TOKEN 存在時) → gh release edit --draft=false (finalize)
```

### 4. script/release (全面拡張)

`script/release [major|minor|patch] [--version X.Y.Z] [--no-watch] [--help]`

1. プリフライト: gh インストール/認証 (`gh auth status`) 確認 (失敗時 exit 1)、未コミット変更の警告、
   シークレット状況表示 (`gh secret list` から NPM_TOKEN / MIMO_FDS_AK / MIMO_FDS_SK の有無を警告)。
2. 発火: `gh workflow run publish.yml -f bump=<type> [-f version=<ver>]`、run URL 表示。
3. 監視: `gh run watch --exit-status` (失敗時 `--log-failed` 表示 + exit 1)、`--no-watch` でスキップ。
4. 結果: ジョブ別サマリ (`gh run view`) + リリース URL 表示。末尾に「docs/RELEASING.md 参照」を表示。

### 5. docs/RELEASING.md (NEW, 日本語ランブック)

概要 / 前提条件 (シークレット一覧と省略時挙動) / リリース手順 (script/release の使い方) /
バージョン決定規則 / ワークフロー各ジョブの動作 / アセットと SHA256SUMS・インストーラー検証 /
npm per-platform 配布 / FDS ミラー / トラブルシュート表 / 開発・デバッグ用コマンド。

### 6. AGENTS.md + プロジェクト MEMORY.md (編集)

- AGENTS.md: 「Release procedure and troubleshooting live in `docs/RELEASING.md` (Japanese). Cut a
  release with `./script/release <major|minor|patch>` — consult the runbook first.」を追記。
- MEMORY.md ## Rules: 「リリース手順・トラブルシュートは `docs/RELEASING.md` を参照…」を追記。

## テスト結果

実行: `bun test --timeout 30000 test/cli/release-build-matrix.test.ts` → **23 pass / 0 fail (61 expect)**

| ID | 内容 | 結果 |
|---|---|---|
| T1 | targetName が 12 アセット名を計算 (win32→windows、baseline→musl 順) | PASS |
| T1b | 接尾辞・OS 変換の単体 | PASS |
| T2 | filterTargets 空フィルタ = 全ターゲット | PASS |
| T2b | 単一ターゲット選択 | PASS |
| T2c | 複数カンマ区切り選択 | PASS |
| T2d | 未知名は無視 | PASS |
| T2e | **プレフィックスなし (matrix 形式 `linux-x64`) の一致** | PASS |
| T3 | publish.yml: workflow_dispatch 維持 | PASS |
| T3b | build-cli が 12 ターゲット matrix | PASS |
| T3c | MIMOCODE_TARGETS 受け渡し | PASS |
| T3d | 依存チェーン version → build-cli → publish | PASS |
| T3e | publish ジョブの集約 SHA256SUMS 再生成 | PASS |
| T3f | finalize (--draft=false) | PASS |
| T3g | npm publish の NPM_TOKEN ガード | PASS |
| T4 | build.ts が MIMOCODE_TARGETS を参照 | PASS |
| T4b | 全ビルド時のみ SHA256SUMS 生成 (matrix はスキップ) | PASS |
| T4c | targets.ts ヘルパー再利用 | PASS |
| T5 | script/release: --no-watch / watch / プリフライト / ランブック参照 | PASS |
| T5b | `--help` スパウン exit 0 + usage | PASS |
| T5c | 未知引数スパウン exit 1 + stderr usage | PASS |
| T6 | docs/RELEASING.md 必須セクション存在 | PASS |
| T7 | AGENTS.md が docs/RELEASING.md を参照 | PASS |
| T7b | targets.ts が副作用なしで import 可能 | PASS |

## 検証 (回帰・実機)

| 検証 | コマンド | 結果 |
|---|---|---|
| typecheck | `bun typecheck` (packages/opencode, tsgo) | PASS |
| 既存リリーステスト | `bun test --timeout 30000 test/cli/release-installer.test.ts` | 10/10 PASS |
| 回帰 | `bun test --timeout 30000 test/cli/` | **374 pass / 4 fail (54 ファイル)** — 4 fail は既知の `voice` ネットワークタイムアウト (環境要因、本タスクと無関係) |
| 実ビルド | `MIMOCODE_TARGETS=linux-x64 MIMOCODE_VERSION=0.0.0-test bun packages/opencode/script/build.ts` | linux-x64 単一ターゲットがビルドされ、スモークテスト (`dist/oimo-linux-x64/bin/oimo --version`) 成功。matrix モードで SHA256SUMS が生成されないことも確認 |
| スクリプト | `./script/release --help` | exit 0、usage + runbook 参照を表示 |

## リリース実行手順 (変更後)

```bash
# シークレット設定後 (NPM_TOKEN / MIMO_FDS_AK / MIMO_FDS_SK)
./script/release              # patch リリース (プリフライト→発火→監視→サマリ)
./script/release minor        # minor
./script/release --version 0.1.14   # バージョン直接指定
./script/release --no-watch   # 発火のみ
```

発火後は workflow が 12 ターゲットを並列ビルド → 集約 SHA256SUMS → npm publish → リリース公開まで自動実行。
詳細は docs/RELEASING.md。

## 知見

- **アセット名の接尾辞順は baseline → musl** (`oimo-linux-x64-baseline-musl`)。元 build.ts の順序を
  targets.ts で維持した。matrix のターゲット名を `linux-x64-baseline-musl` に合わせ、テストも実アセット名と
  一致させる必要がある (初回テストで `-musl-baseline` と誤記 → 修正)。
- **matrix のターゲット名はプレフィックスなし** (`linux-x64`) だが targetName は `oimo-` 付きを返す。
  filterTargets は両形式を受け付ける実装とした (初回実ビルドでフィルタ不一致を実測し修正)。
- **SHA256SUMS は matrix ジョブでは生成しない** (部分チェックサムの競合回避)。publish ジョブが
  `gh release download --pattern 'oimo-*'` で全アセットを取り直し、`checksums.ts` (stdout 出力) で
  単一の正を生成して `--clobber` アップロードする。`oimo-*` パターンは SHA256SUMS 自身を除外するため
  再実行でも安全。
- ローカル全ビルド (MIMOCODE_TARGETS 未指定) は従来どおり build.ts 内で SHA256SUMS を生成 —
  matrix 導入後も後方互換。
