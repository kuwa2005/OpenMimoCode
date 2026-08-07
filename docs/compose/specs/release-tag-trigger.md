# Spec: Tag-triggered release workflow (release.yml)

- Status: Draft
- Date: 2026-08-07
- Owner: Open Mimo Code Compose Agent (SE autonomy, never-ask)

## 概要

GitHub にバージョンタグ (`v1.0.0` 形式) がプッシュされたら、自動でビルドして GitHub Releases を作成する
GitHub Actions ワークフロー `.github/workflows/release.yml` を新設する。既存の dispatch 方式
(`publish.yml` + `script/release` の `gh workflow run`) は廃止し、リリース制御を GitHub Actions へ完全移譲する。

本依頼はテンプレート形式 (トリガー / 環境 / ビルド手順 / softprops / permissions の各要件) で届いており、
空欄の [開発言語] / [ビルド手順] はプロジェクト実態で補完する。

## [S1] 現状と課題

- リリースは `.github/workflows/publish.yml` (workflow_dispatch のみ) を `script/release` が
  `gh workflow run` で発火する方式。v0.1.14 はこの方式で 2026-08-07T13:12:55Z に公開済み
  (12 アセット + SHA256SUMS)。
- 運用は「バージョン決定 → 発火 → 監視」の 3 ステップで、バージョン bump はワークフロー内の
  version job が package.json を書き換え push している (Actions の detached HEAD push 等の複雑性あり)。
- ユーザー依頼: **タグプッシュで自動ビルド + GitHub Releases 作成** に制御を移譲したい。
  テンプレートは `softprops/action-gh-release` と `contents: write` を明示要求。

## [S2] ヒアリングログ (H1–H4)

never-ask モードのため全問 self-answered。選択と理由を本文に明示する。

| ID | 質問 | なぜ聞いたか | 背景 | 結果 (自律決定) |
|---|---|---|---|---|
| H1 | 既存 publish.yml (dispatch) + script/release との関係 | 二重管理の回避と移譲の意図確認 | 「リリース制御をGitHub Actionsへ移譲します」+ テンプレートがタグトリガーを明示 | **置き換え** — publish.yml を廃止し release.yml に統合。script/release は「bump → コミット → タグ push」ラッパーに簡素化 |
| H2 | ビルド方式: 既存 12 ターゲットマトリクス再利用 vs テンプレート最小構成 | インストーラー (OIMO_BASE_URL / アセット命名) と SHA256SUMS への依存 | 最小構成 (`npm run build` → ./dist ZIP) だと install/install.ps1 が壊れる | **既存パイプライン再利用** — build.ts + 12 ターゲット matrix + SHA256SUMS を維持し、**softprops/action-gh-release をリリース作成に採用** (テンプレート要件を満たす) |
| H3 | テンプレート空欄 ([開発言語] / [ビルド手順]) の解釈 | 空欄のままでは要件が確定しない | 本リポジトリは Bun/TypeScript モノレポ | **Bun (TypeScript) / `bun packages/opencode/script/build.ts` (MIMOCODE_VERSION=タグ名)** |
| H4 | script/release の扱い | 移譲後のローカル側の役割 | 現状は dispatch ディスパッチャ | **bump+タグ push ラッパー化** — バージョン整合性 (package.json ラグ) も恒久解消 |

## [S3] 設計: release.yml (タグトリガー)

`.github/workflows/release.yml` (新規):

```yaml
name: release
run-name: "release ${{ github.ref_name }}"

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  build-cli:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        target: [12 ターゲット (既存 publish.yml と同じリスト)]
    steps:
      - checkout (fetch-depth: 0, fetch-tags: true)
      - ./.github/actions/setup-bun
      - build: bun packages/opencode/script/build.ts
        env:
          MIMOCODE_VERSION: ${{ github.ref_name }} の "v" を除去した値
          MIMOCODE_RELEASE: "1"          # アーカイブ生成を有効化
          MIMOCODE_SKIP_UPLOAD: "1"      # 新規: gh release upload を抑止 (リリース未作成のため)
          MIMOCODE_TARGETS: ${{ matrix.target }}
          GH_REPO / MIMO_FDS_* (シークレット)
      - upload-artifact (name: oimo-${{ matrix.target }}, path: packages/opencode/dist/*.{tar.gz,zip})
  assemble:
    needs: build-cli
    runs-on: ubuntu-latest
    steps:
      - checkout (fetch-depth: 0, fetch-tags: true)
      - setup-bun / setup-node (npm 用)
      - download-artifact (pattern: oimo-*, merge-multiple: true → release-assets/)
      - SHA256SUMS 集約生成: bun script/checksums.ts release-assets/* > release-assets/SHA256SUMS
      - リリースノート生成: script/changelog.ts --from <直前タグ> --to HEAD --print
      - softprops/action-gh-release@v2
        (tag_name: ${{ github.ref_name }}, files: release-assets/*, body_path: リリースノート,
         draft: false, fail_on_unmatched_files: true)
      - npm 公開 (NPM_TOKEN ガード): 設定時のみ bun script/publish.ts
```

- **トリガー**: `push.tags: ["v*"]`。workflow_dispatch は持たない (タグのみ)。
- **permissions**: `contents: write` (リリース作成権限 — 要件明示)。
- **バージョン**: タグ名から導出 (`v0.1.15` → `MIMOCODE_VERSION=0.1.15`)。bump コミットは行わない
  (バージョンの真実はタグ。package.json の bump は script/release がタグ push 前に実施)。
- **アセット**: matrix 各ジョブはアーカイブを actions/upload-artifact で渡し、assemble が
  集約 SHA256SUMS を生成して softprops でリリースに添付 (12 アーカイブ + SHA256SUMS = 13 ファイル)。
- **公開タイミング**: softprops `draft: false` によりアセット添付と同時に公開。
  (失敗時は softprops が走らずリリース自体が作られない — 不完全な公開リリースは発生しない)
- **npm**: 従来どおり NPM_TOKEN ガード (未設定時は警告のみ、GitHub リリースは完了)。
- **FDS**: build.ts 内の FDS ブロックは `Script.release` ガードのまま (SKIP_UPLOAD の影響を受けない)。
  シークレット未設定時は従来どおりスキップ。

## [S4] 設計: build.ts の SKIP_UPLOAD ゲート

`packages/opencode/script/build.ts` のリリースブロック (L238–280) のうち、
**gh release upload のみ**を新 env `MIMOCODE_SKIP_UPLOAD` でゲートする:

```ts
if (!process.env.MIMOCODE_SKIP_UPLOAD) {
  await $`gh release upload v${Script.version} ${uploads} --clobber --repo ${process.env.GH_REPO}`
}
```

- アーカイブ生成・SHA256SUMS (全ビルド時)・FDS アップロードは従来どおり `Script.release` ガード。
- ローカル全リリースビルド (SKIP_UPLOAD 未設定) は挙動不変 (後方互換)。
- matrix タグフローは SKIP_UPLOAD=1 でアーカイブのみ生成 → upload-artifact で受け渡し。

## [S5] 設計: script/bump.ts (新規) + script/release (bash 書き換え)

### script/bump.ts (新規、`#!/usr/bin/env bun`)

- CLI: `bun script/bump.ts <major|minor|patch|X.Y.Z>`
- 純関数 `nextVersion(current: string, type: string): string` を export (テスト容易性)。
- 処理: 明示バージョン or bump 種別から次バージョンを算出 → `bumpVersions(version)` で
  全 package.json を書き換え → 変更があれば `git add ${changed}` + `git commit "chore: bump version to <v>"`
  → 新バージョンを stdout に出力 (変更なしでも出力)。
- `script/version.ts` の bump+コミット部分を承継 (changelog / release 作成はワークフローへ移設)。

### script/release (bash 書き換え)

```
Usage: script/release [major|minor|patch] [--version X.Y.Z] [--no-watch] [--help]
```

フロー: プリフライト (gh 認証 / 未コミット警告 / シークレット表示) →
`VERSION=$(bun script/bump.ts ...)` → ブランチ push → `git tag v$VERSION` + `git push origin v$VERSION`
→ release.yml の run を検出 (`gh run list --workflow release.yml --json headBranch` をポーリング) →
`gh run watch` (--no-watch でスキップ、失敗時 `--log-failed`) → リリース URL 表示。

- `docs/RELEASING.md` 参照のフッターは維持。

## [S6] 削除対象

- `.github/workflows/publish.yml` — release.yml に統合のため削除。
- `script/version.ts` — 役割を bump.ts + ワークフローに分割移設のため削除。
- `script/release.ts` (bun 版ローカルランナー) — bash `script/release` に完全に取って代わられた
  レガシーであり、参照も無いため削除。
- `script/bump-version.ts` は残す (純関数 `bumpVersions` は publish.ts / bump.ts が利用)。

## [S7] ドキュメント更新

- `docs/RELEASING.md` — リリース手順を「タグプッシュ」方式に全面改訂
  (トリガー: v* タグ push / script/release = bump+タグ push / ワークフロー各ジョブの動作 / アセット・
  SHA256SUMS・インストーラー / npm / FDS / トラブルシュート)。
- `AGENTS.md` — リリース手順の参照行をタグプッシュ方式に更新。
- プロジェクト `MEMORY.md` ## Rules — 同上。
- `docs/index.html` — 変更後 `bun script/build-docs-index.ts` で再生成 (生成物)。

## [S8] テスト仕様

既存 `packages/opencode/test/cli/release-build-matrix.test.ts` を改修 + 拡張:

- T1/T1b/T2/T2b/T2c/T2d/T2e — targets.ts (現行のまま維持)
- **T3 (改修)** — release.yml 静的: `push:` + `tags:` + `- "v*"` が存在し `workflow_dispatch` が**無い**こと
- **T3b (維持)** — build-cli が 12 ターゲット matrix
- **T3c (維持)** — `MIMOCODE_TARGETS: ${{ matrix.target }}`
- **T3d (改修)** — assemble が `needs: build-cli` (version job は無い)
- **T3e (改修)** — assemble で `checksums.ts release-assets/*` による集約 SHA256SUMS
- **T3f (改修)** — `softprops/action-gh-release@v2` + `draft: false` + `contents: write`
- **T3g (維持)** — npm が `if [ -z "$NPM_TOKEN" ]` ガード
- **T3h (新規)** — upload-artifact / download-artifact でアーカイブ受け渡し (oimo-* パターン)
- **T3i (新規)** — matrix ジョブに `MIMOCODE_SKIP_UPLOAD: "1"` + `MIMOCODE_VERSION` がタグ由来
- **T4/T4b/T4c (維持)** — build.ts の MIMOCODE_TARGETS / SHA256SUMS / targets.ts 利用
- **T4d (新規)** — build.ts が `MIMOCODE_SKIP_UPLOAD` 設定時に gh release upload を抑止
- **T5 (改修)** — script/release: `bun script/bump.ts` / `git tag` / `git push origin v` / `gh run watch` /
  `docs/RELEASING.md` / `gh secret list` / `--no-watch`
- **T5b/T5c (維持)** — --help は exit 0 / 未知引数は exit 1
- **T6 (改修)** — RELEASING.md 必須セクション + `./script/release` + `release.yml` + SHA256SUMS + OIMO_BASE_URL
- **T7/T7b (維持)** — AGENTS.md 参照 / targets.ts import 安全
- **T8 (新規)** — `nextVersion` 純関数ユニット (patch/minor/major/明示)
- **T9 (改修)** — release-installer.test.ts の publish.yml 静的チェックを release.yml 用に置換
  (tags トリガー / softprops / MIMOCODE_SKIP_UPLOAD / `script/version.ts` 参照の除去)

## [S9] 検証手順

- V1: `bun test --timeout 30000 test/cli/release-build-matrix.test.ts` — 全 PASS
- V2: `bun test --timeout 30000 test/cli/release-installer.test.ts` — 全 PASS
- V3: `bun test --timeout 30000 test/cli/` — 回帰 (既知 voice 4 fail のみ)
- V4: `bun typecheck` — PASS
- V5: actionlint で release.yml 検証 + push 後の `gh api .../actions/workflows` 登録確認
  (このリポジトリではワークフロー登録拒否がサイレントに起きる実績があるため必須)
- V6: **実トリガー (タグ push) は実施しない** — 公開リリースが即座に作られるため。
  登録確認 + 静的テスト + actionlint で担保し、その旨をレポートに記録する。
