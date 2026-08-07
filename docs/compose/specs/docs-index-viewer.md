# Spec: docs ビューア (docs/index.html 左右 2 ペイン)

- Status: Approved
- Date: 2026-08-06
- Author: compose agent (SE mode)
- Type: feature spec

## 背景

--se モードの自律エージェント実行時に `docs/` 配下へ各種ドキュメント (specs / reports / plans /
architecture / harness / RELEASING.md 等、現在 61 ファイル) が次々と生成される。これらを一覧し、
ブラウザで快適に読むための左右 2 ペイン・ビューア (docs/index.html) が欲しいという依頼。

## ヒアリングログ

### H1 (2026-08-06) — 描画方式
- なぜ聞いたか: 閲覧環境 (file:// 直叩き vs HTTP サーバー) で fetch の可否が変わり、方式選択が直結する。
- 背景: docs/ は 61 md ファイル。動的 fetch 方式は file:// で動かず、GitHub Pages 配信は
  pages.yml (リポジトリルートをデプロイ) で実現済み。--se モードで文書が増え続ける運用を想定。
- 結果: **内容埋め込み + 生成スクリプト** (script/build-docs-index.ts が全 md をスキャンし、
  タイトル+本文+レンダラーを埋め込んだ単一 HTML を生成。file:// / Pages / オフライン全てで動作。
  pages.yml にも再生成ステップを追加し、公開サイトは常に最新を維持)。

### H2 (2026-08-06) — マークダウン描画エンジン
- なぜ聞いたか: 自前レンダラーは依存ゼロだが 61 文書の全記法 (表・コードブロック等) をカバーする
  リスクがあり、逆に外部ライブラリはネット必須になり得る。
- 背景: marked.js は MIT ライセンス・単体 ~40KB。vendored すればオフラインでも動作。
- 結果: **marked.js を script/vendor/marked.min.js に vendored し、生成 HTML にインライン埋め込み**。

### H3 (2026-08-06) — 左ペイン構成
- なぜ聞いたか: 61 件の一覧性と実装コストのトレードオフ。
- 背景: docs/ は specs/・spec/・reports/・plans/・architecture/・harness/・ルート直下に分散。
- 結果: **ディレクトリ別グループ + インクリメンタル検索フィルタ**。

### H4 (2026-08-06) — テーマ
- なぜ聞いたか: 閲覧者の環境 (ライト/ダーク) は実行時にしか分からない。
- 背景: 単一 HTML なので CSS カスタムプロパティで対応が容易。
- 結果: **prefers-color-scheme 自動 + 手動トグル (localStorage 永続)**。

### H5 (2026-08-06) — Requirements Lock
- [Never-Ask] (ヘッドレス) — 推奨案 (R1–R9) を Approved として扱い実装へ進む。

## 要件 (Requirements)

- **R1 生成物**: `docs/index.html` は生成物。`script/build-docs-index.ts` (リポジトリルート) が
  `docs/**/*.md` を再帰スキャンし、単一 HTML を生成する。
- **R2 自己完結**: 生成 HTML は外部参照なし (CSS / JS / Markdown レンダラーを全てインライン)。
  `file://` でもオフラインでも動作する。
- **R3 左ペイン**: ディレクトリ別グループ (トップ / specs / spec / plans / reports / architecture /
  harness / その他) + インクリメンタル検索フィルタ。クリックで右ペインに表示。
- **R4 右ペイン**: 選択文書を marked で描画。上部にタイトルとパス表示。描画結果から `<script>` 要素を
  除去するサニタイズを行う。
- **R5 埋め込み安全性**: 文書本文の埋め込みは `JSON.stringify` + `<` を `\u003c` に置換
  (JSON ペイロード内で `</script>` を無害化)。これにより manifest の破壊と XSS を防止。
- **R6 タイトル抽出**: frontmatter `title:` → 最初の `# H1` → ファイル名の順でフォールバック。
- **R7 ソート**: グループ内は相対パス昇順。
- **R8 CI 再生成**: `.github/workflows/pages.yml` に `bun script/build-docs-index.ts` のステップを追加し、
  公開 Pages が常に最新になるようにする。
- **R9 参照記録**: AGENTS.md に「docs/index.html の再生成は `bun script/build-docs-index.ts`」を追記。

## テスト仕様 (Test Specification)

- 実行: `export PATH="$HOME/.bun/bin:$PATH" && bun test --timeout 30000 test/cli/docs-index.test.ts`
  (workdir=packages/opencode)。4 段 import (`../../../../script/build-docs-index.ts`)。
- フィクスチャ: `tmpdir()` (packages/opencode/test/fixture/fixture.ts) に最小 md を作成。

| ID | 内容 |
|---|---|
| T1 | `collectDocs()` が実際の docs/ から全 61 md を検出し、ソート済みである |
| T2 | `titleOf()` — frontmatter title / H1 / ファイル名フォールバックの 3 系統 |
| T3 | `groupOf()` — specs/spec/plans/reports/architecture/harness/root のグループ分け |
| T4 | `escapeForScript()` — `<` が `\u003c` に置換され、`</script>` を含む文書が安全に埋め込まれる |
| T5 | `renderDocsIndex()` — 生成 HTML に左右ペイン構造・manifest JSON・marked コード・テーマ切替ロジックが含まれる |
| T6 | 決定性 — 同一入力から 2 回生成してバイト一致 |
| T7 | E2E — 実際の `bun script/build-docs-index.ts` 実行が exit 0、docs/index.html が生成され、全 61 文書のパスが manifest に含まれる |
| T8 | pages.yml に再生成ステップ (build-docs-index) が存在する |

## 実機検証 (§V)

1. `bun script/build-docs-index.ts` → exit 0、docs/index.html 生成。
2. `bun serve docs` 等で配信し、fetch で HTML を取得 → manifest に全 61 文書、構造タグを確認
   (ブラウザ描画は環境にヘッドレスブラウザがないため、静的検証 + ロジック単体テストで代替)。
3. 生成 HTML が `file://` でも開けること (外部参照ゼロを静的確認)。
