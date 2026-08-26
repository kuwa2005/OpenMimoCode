# oimo 機能追加の置き場所方針（コア / ビルトイン / agent-skills）

> 採用方針（2026-08-26）。機能を足すとき「本隊を触るか・同梱スキルか・配布リポか」を自動で振り分けるための判断基準。  
> エージェントは本ドキュメントに従い、実装前に置き場を決めてから着手する。

## 結論

**デフォルトはスキル側。本隊改造はプラットフォームに限る。**

- **oimo 全員に同梱したい** → ビルトイン（`src/skill/builtin/.bundle`）
- **ビルトインが他ホストでも有用** → **同じ能力を [`kuwa2005/agent-skills`](https://github.com/kuwa2005/agent-skills) にも載せる**（ポータブル版）
- **最初からホスト横断・任意インストール** → agent-skills のみ（同梱は不要ならビルトインに載せない）
- **実行時の不変条件** → 本隊

```
新しい機能の置き場所?

  実行時の不変条件・安全・セッション・TUI・プロバイダ・権限か?
    YES → 本隊（packages/opencode）
    NO  ↓

  oimo を入れた全員に最初から載せたい製品能力か?
    YES → ビルトインに追加
         └─ Cursor / OpenCode でも有用? → agent-skills にも追加（推奨）
    NO  ↓

  Cursor / OpenCode / oimo 横断、または任意インストールでよいか?
    YES → agent-skills のみ
    NO  → プロジェクトローカル .oimo/skills
```

| 層 | 役割 | 置き場 |
|---|---|---|
| **本隊** | エンジン・TUI・信頼性・権限 | `packages/opencode/src/**` |
| **ビルトイン** | oimo 製品同梱 | `packages/opencode/src/skill/builtin/.bundle/**` |
| **agent-skills** | ホスト横断のポータブル配布 | [`kuwa2005/agent-skills`](https://github.com/kuwa2005/agent-skills) → `~/.cursor/skills` / `~/.config/opencode/skills` / `~/.config/oimo/skills` |
| **プロジェクト** | リポ固有の結晶化 | `<worktree>/.oimo/skills/` |

Compose 内部スキル（`skill/compose/.bundle`）はユーザー向けではなく Compose 専用オーケストレーション。本方針の「ビルトイン充実」とは別枠。

---

## ビルトイン → agent-skills の昇格（必須ルール）

ビルトインに入れたスキルが **oimo 以外でも役立つ**（手順・スクリプトがホスト非依存、または軽い条件分岐で足りる）なら、**agent-skills にも入れる**。

| 観点 | ビルトイン側 | agent-skills 側 |
|---|---|---|
| 目的 | oimo 同梱の既定体験 | Cursor / OpenCode / oimo への curl 配布 |
| oimo 専用 API 依存 | そのまま書いてよい | 削る／「oimo では同梱版を優先」と書く／フォールバックを書く |
| 更新 | oimo リリースに乗せる | agent-skills を独立に更新してよい（内容は揃える） |
| catalog | — | 既定利用者向けなら `catalog.txt`、任意なら `optional.txt` |

**二重メンテは許容する。** ただし片方だけ古くしない。ビルトインを直したら agent-skills 側の要否を必ず確認し、載っているなら同じ PR シリーズで追従する（リポが別なら follow-up タスクを残す）。

oimo 専用すぎて他ホストで無意味なもの（例: `mimocode-docs` の製品リファレンス全文、`evolve` の oimo パス前提）は **ビルトインのみ**でよい。ポータブルな核だけ切り出せるなら、薄い版を agent-skills に出す。

---

## 現状の境界（根拠）

### 本隊

セッションループ、LLM、再試行、ツール、権限、プロバイダ、メモリ配管、TUI、ホットリロード土台。

### ビルトイン

`builtin/extract.ts` で `~/.local/share/oimo/builtin_skills/<version>/skills/` へ展開。  
`MIMOCODE_DISABLE_BUILTIN_SKILLS` 等で切れる → 切られても必須動作は本隊側で保つ。

### agent-skills

`curl | bash` で三ホストへインストール。開発衛生・ドメインスクリプト・任意スキルの倉庫。

### 上書き順

ユーザー／`~/.config/oimo/skills` は同名でビルトインを上書きできる。同梱は既定、配布・プロジェクトは上書き。

---

## 判断基準（チェックリスト）

### A. 本隊

次の **いずれか** のときだけ。

1. スキル無効でも壊れてはいけない動作
2. TUI / API / プロトコル変更
3. 新ランタイム primitive
4. セキュリティ／サンドボックス境界
5. 信頼性ホットパス（リトライ、フェイルオーバー等）

本隊は薄く。手順の文章はスキルへ。

### B. ビルトイン

次を満たすとき。

1. oimo 利用者の大多数に最初から見せたい
2. バイナリ版と手順を揃えたい、または oimo API に依存する

追加後: **他ホストでも有用なら agent-skills にも載せる**（上記昇格ルール）。

### C. agent-skills のみ

1. 最初からホスト横断・任意インストールで十分
2. 同梱するとバイナリが重い／更新を oimo リリースから切り離したい
3. すでに agent-skills が真実で、oimo 同梱が不要

### D. プロジェクト `.oimo/skills`

そのリポ固有。evolve / distill の出力。製品配布には使わない（汎用化したら B または C へ昇格）。

---

## エージェント向け：自動振り分け手順

機能追加・仕様変更の依頼を受けたら、実装前に必ず:

1. 本ドキュメントのフローチャートで置き場を決める（本隊 / ビルトイン / agent-skills / プロジェクト）
2. ユーザーへの最初の実質作業説明に、選びと一言理由を書く（例:「ホスト横断なので agent-skills」「セッション契約なので本隊」）
3. ビルトインに足す場合、agent-skills への同時追加または follow-up の要否を明示する
4. PR / コミット説明に置き場を1行含める

置き場が曖昧なら、スキル側（ビルトインまたは agent-skills）を既定とし、本隊は primitive 不足が証明されたときだけ触る。

---

## 具体例

| やりたいこと | 置き場 |
|---|---|
| レート制限バックオフ、セッション停止ダイアログ | 本隊 |
| `--log` 既定 ON | 本隊 |
| Excel → 仕様書 | agent-skills（既存） |
| verify / prevent-secret-leak | agent-skills（既存） |
| `/evolve`（oimo API 密結合） | ビルトイン（他ホスト向け薄版が作れるなら agent-skills も） |
| 汎用デザイン指針（frontend-design） | ビルトインに載せるなら **agent-skills にも載せる**（既存 optional と揃える） |
| PR babysit | agent-skills |
| 新プロバイダ | 本隊 |

---

## PR レビュー用チェック

- [ ] 置き場は 本隊 / ビルトイン / agent-skills / プロジェクト のどれか明示
- [ ] スキル無効時に必須動作が壊れない
- [ ] ビルトイン追加時、agent-skills への同時追加 or 「oimo 専用のため不要」の理由がある
- [ ] 両方にあるスキルを直したとき、片方だけの古さを残していない

---

## 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-08-26 | 初版 |
| 2026-08-26 | 有用なビルトインは agent-skills にも載せる方針に変更。エージェント自動振り分け手順を追加 |
