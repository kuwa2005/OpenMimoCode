# リリース手順 (RELEASING)

このドキュメントは OpenMimoCode のリリースを「迷わず」進めるためのランブックです。
リリースカットは原則 **`./script/release` の 1 コマンド** で完結します。詳細な仕組みを知りたい場合や
トラブル時は、このドキュメントの該当セクションを参照してください。

## 概要

リリースは GitHub Actions ワークフロー (`.github/workflows/publish.yml`) が以下の 3 ジョブで実行します。

```
version (バージョン決定・bump・コミット・push・ドラフトリリース作成)
   ↓
build-cli (12 ターゲットを build matrix で並列ビルドし、ドラフトにアセットをアップロード)
   ↓
publish (SHA256SUMS 集約生成 → npm 公開 → リリースを public 化)
```

- **トリガー**: `workflow_dispatch` のみ。push で自動リリースはしません (公開は不可逆操作のため)。
- **公開まで自動**: 発火後はビルド・アセット・チェックサム・npm 公開・リリース公開まで CI が自動実行します。
  人間が操作するのはトリガー (次の手順) だけです。

## 前提条件

リリースに必要な環境とシークレット。

1. **gh CLI がインストール・認証済み** (`gh auth status` で確認)。必要なスコープ: `repo` と `workflow`。
2. **リポジトリシークレット** (リポジトリ Settings → Secrets and variables → Actions):

   | シークレット | 必須 | 省略時の挙動 |
   |---|---|---|
   | `NPM_TOKEN` | 任意 | npm 公開をスキップし、warning を出力 (GitHub リリース自体は完了) |
   | `MIMO_FDS_AK` / `MIMO_FDS_SK` | 任意 | FDS (中国向け CDN ミラー) へのアップロードをスキップ |
   | `MIMO_FDS_ENDPOINT` / `MIMO_FDS_BUCKET` / `MIMO_FDS_PREFIX` | 任意 | FDS の接続先 (既定値がある場合は不要) |

   `gh secret list` で確認できます。`script/release` がプリフライトで設定状況を表示します。

3. **作業ツリー**: 未コミットの変更があると警告が出ます。リリースの bump コミットには
   **コミット済みの変更** だけが含まれるので、必要なら先にコミットしておいてください。

## リリース手順

```bash
# patch リリース (既定)
./script/release

# 明示的に bump 種別を指定
./script/release minor

# バージョンを直接指定 (bump 計算をスキップ)
./script/release --version 0.1.14

# 発火のみで監視しない (バックグラウンドで回す場合)
./script/release --no-watch
```

`script/release` が行うこと:

1. **プリフライト** — gh の存在・認証、未コミット変更の警告、シークレット設定状況の表示。
2. **発火** — `gh workflow run publish.yml -f bump=<type> [-f version=<ver>]`。
3. **監視** — `gh run watch` で完了まで待機 (途中で Ctrl-C してもワークフローは継続)。
4. **結果表示** — ジョブ別の結果とリリースページの URL。

完了後、リリースページ (例: `https://github.com/kuwa2005/OpenMimoCode/releases`) で
リリースノートと 12 アセット + `SHA256SUMS` を確認してください。

### バージョン決定規則

- `--version X.Y.Z` を指定 → そのバージョンをそのまま使用 (`MIMOCODE_VERSION`)。
- bump 種別 (`major`/`minor`/`patch`) → `packages/opencode/package.json` の現在バージョンから
  `script/bump-version.ts` (`bumpVersions`) が 1 段上げ、**全 package.json を一括書き換え**
  (`node_modules` / `dist` は除外)。
- 指定がない場合は `patch` が既定。

バージョン決定 → `bumpVersions` → 各 package.json の `git add/commit/push`
(`chore: bump version to <version>`) → push 後に `git rev-parse HEAD` でコミット SHA を取得 → リリースノート生成 → ドラフトリリース作成、の順です。

## ワークフロー各ジョブの動作

### version

- `script/version.ts` を実行。
- バージョン決定と bump コミット (**push は `git push origin HEAD:<branch>`** — Actions は detached HEAD のため)。
- リリースノートを `script/changelog.ts` で生成 (git log、conventional commit グループ化)。
- `gh release create v<version> --draft --target <push 後 SHA>` でドラフトリリースを作成。
- 出力: `version` / `release` (databaseId) / `tag` / `repo` を後続ジョブへ渡す。

### build-cli (build matrix)

- 12 ターゲット (`linux-arm64`, `linux-x64`, `linux-x64-baseline`, `linux-arm64-musl`,
  `linux-x64-musl`, `linux-x64-musl-baseline`, `darwin-arm64`, `darwin-x64`,
  `darwin-x64-baseline`, `windows-arm64`, `windows-x64`, `windows-x64-baseline`) を
  **並列ジョブ**でビルド。逐次ビルド時代に比べウォールクロックが大幅に短縮されます。
- 各ジョブは `MIMOCODE_TARGETS=<target>` で自分のターゲットだけをビルドし、
  `packages/opencode/script/build.ts` が `gh release upload` でアセット
  (`oimo-<os>-<arch>[-baseline][-musl].{tar.gz|zip}`) をドラフトへアップロード。
- FDS シークレットがあれば各ジョブが自分のアセットを FDS ミラーへもアップロード。
- `packages/opencode/script/targets.ts` がターゲット定義・名前計算を一元管理します
  (`MIMOCODE_TARGETS` 未指定なら従来どおり全ターゲットを 1 プロセスでビルド — ローカルリリースビルド互換)。

### publish

1. `gh release download` でドラフトの全アセットを取得し、`script/checksums.ts` で
   **SHA256SUMS を集約生成**してアップロード (`--clobber`)。matrix で分散ビルドしても
   チェックサムは単一の正にまとまります。
2. `NPM_TOKEN` があれば `script/publish.ts` で npm 公開 (per-platform パッケージ群)。
   なければ warning のみ (リリースは完了)。
3. `gh release edit --draft=false` でリリースを public 化。

## アセットとチェックサム・インストーラー検証

- リリースには 12 アーカイブ + `SHA256SUMS` が含まれます。形式は `sha256sum -c` 互換
  (`<hex>  <name>`、名前順ソート)。
- インストーラー (`install` / `install.ps1`) は `SHA256SUMS` をダウンロードして検証します:
  - 不一致 → インストール中止 (exit 1)。
  - `SHA256SUMS` が無い / エントリが無い (旧リリース) → 警告のみで継続 (後方互換)。
- `OIMO_BASE_URL` 環境変数でダウンロード・チェックサム取得のベース URL を差し替えられます
  (既定は `https://github.com/<repo>`。FDS ミラー運用やテストで使用)。

## npm 配布

npm は **per-platform オプショナル依存パッケージ** 方式です
(`@mimo-ai/oimo-<platform>-<arch>`、`postinstall.mjs` が解決)。`script/publish.ts` が
各ターゲットのパッケージを作成・公開します。GitHub リリースのアーカイブは curl/irm インストーラー用であり、
npm とは独立です。

## FDS ミラー (任意)

中国向け CDN ミラー。`MIMO_FDS_AK` / `MIMO_FDS_SK` (と必要に応じて ENDPOINT/BUCKET/PREFIX) を設定すると、
各 build-cli ジョブがアセットを FDS へもアップロードします。シークレット未設定時は自動スキップです。

## トラブルシュート

| 症状 | 原因と対処 |
|---|---|
| `Error: not authenticated with gh` | `gh auth login` を実行 (スコープ: repo, workflow)。 |
| `[warn] NPM_TOKEN is NOT set` | npm 公開がスキップされます。必要ならリポジトリシークレットに追加して再実行。 |
| `checksum mismatch` でインストール失敗 | ダウンロードが壊れているか、リリースの SHA256SUMS と実アセットが不一致。リリースページで SHA256SUMS を再確認し、壊れたリリースは `gh release delete` + 再実行。 |
| リリースノートが「No notable changes」になる | 現在の HEAD が最新タグ内 (変更なし) か、直近タグがローカルに無い。`git fetch --tags` してから再実行。 |
| `git push` で detached HEAD エラー | ワークフロー内では `git push origin HEAD:<branch>` を使用済み。ローカル実行時のエラーならブランチを確認。 |
| build-cli の一部ジョブだけ失敗 | matrix は `fail-fast: false` なので他ターゲットは継続。失敗ジョブのログ (`gh run view <id> --log-failed`) を確認し、修正後に同じバージョンのアセットを再アップロード (`gh release upload v<v> <file> --clobber`) するか、バージョンを上げて再実行。 |
| npm 公開済みなのにインストーラーが古い | インストーラーは GitHub リリースのアセットを参照します。アセットが揃っているかリリースページで確認。 |
| `Unknown argument` が出る | `script/release --help` で使い方を確認。 |

## 開発・デバッグ用コマンド

```bash
# 特定ターゲットだけローカルビルド (アップロードなし)
MIMOCODE_TARGETS=linux-x64 bun packages/opencode/script/build.ts

# チェックサム生成のみ
bun script/checksums.ts <file...>

# リリースノート生成 (タグ範囲)
bun script/changelog.ts --from v0.1.13 --to v0.1.14 --print

# install.ps1 再生成 (決定性)
bun script/build-install-ps1.ts
```
