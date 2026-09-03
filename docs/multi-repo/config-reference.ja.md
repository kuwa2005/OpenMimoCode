# マルチリポジトリ設定リファレンス

発見順（あるディレクトリを起点）:

1. `.oimo/workspace.yaml`（または `.yml` / `.json` / `.jsonc`。ルート直下の同名も可）
2. `.oimo/repos.txt`（または `repos.list` / `repositories.txt`）
3. `.gitmodules` → superproject モード

どれも無い場合は従来どおり単一リポジトリ動作。

---

## 1. `repos.txt`（推奨・最速）

置き場所の例: `<workspace>/.oimo/repos.txt`  
`<workspace>` は兄弟クローンを置く親フォルダ（それ自体が Git である必要はない）。

### 1.1 全体の形

```text
# コメント（# から行末まで）と空行は無視

name: customer-platform
primary: backend

https://github.com/org/frontend
https://github.com/org/backend
https://github.com/org/shared-schema
https://github.com/org/infra read-only
https://github.com/org/api-server id=backend role=REST-API
../already-cloned-billing
```

### 1.2 ヘッダ行（任意・ファイル全体に 1 回ずつ）

| 行 | 必須 | 意味 |
|----|------|------|
| `name: <表示名>` | 任意 | Workspace の表示名。省略時は `workspace`。 |
| `primary: <id>` | 任意 | 主対象リポジトリの **id**。省略時は**最初に書いたリポ行**の id。ツールで `repositoryId` を省略したときの既定先。 |

`name` / `primary` はリポ行ではなくメタ情報。`primary` に書く値は、下のリポ行から決まる **id** と一致させる。

### 1.3 リポジトリ行（1 行 = 1 リポ）

先頭トークンが対象、続きがオプション。

| 先頭トークン | 意味 |
|--------------|------|
| `https://...` / `http://...` / `git@...` | リモート URL。ローカル clone は `<workspace>/<id>/` を期待（`.git` 接尾辞は無視）。 |
| それ以外（例: `../billing`, `/abs/path`） | すでに clone 済みの**ローカルパス**（相対は `repos.txt` がある Workspace ルート基準）。 |

| 後ろに付けられるパラメータ | 意味 | 省略時 |
|---------------------------|------|--------|
| （なし） | 読取・書込可の Git リポとして登録 | — |
| `read-only` または `readonly` | 書込禁止（Resolver が拒否） | `read-write` |
| `read-write` / `readwrite` | 明示的に書込可 | 既定と同じ |
| `id=<識別子>` | Registry 上の安定 id（検索結果・計画・`primary` で使う） | URL/パスの**最終セグメント**（`api-server.git` → `api-server`） |
| `role=<文言>` | 人間向けの役割メモ（空白を含む場合は非対応。短い英数字推奨） | URL 行なら `clone of <url>` |

**id の規則:** `A-Za-z0-9_.-` のみ。`id=` で上書きしないと、GitHub のリポ名がそのままフォルダ名になる想定。

### 1.4 クローン配置との対応

| `repos.txt` | 期待するローカルパス |
|-------------|----------------------|
| `https://github.com/org/frontend` | `<workspace>/frontend/` |
| `https://github.com/org/api-server id=backend` | `<workspace>/backend/` |
| `../billing` | `repos.txt` の基準ディレクトリから見た `../billing` |

未 clone の場合は doctor が `git clone <url> <path>` を提示する（**自動 clone しない**）。  
ヘルパー: `docs/multi-repo/samples/url-list/clone-from-repos-txt.sh`

### 1.5 やってはいけないこと

- 同じ `id` を二行に書く → `duplicate_id` で失敗
- `primary` に存在しない id を書く → 後段の materialize で失敗
- 入れ子になった別 Git ルートを兄弟として並べる（superproject 以外）→ `nested_repositories`

---

## 2. `workspace.yaml`（詳細指定）

置き場所の例: 主リポの `.oimo/workspace.yaml`、または Workspace ルートの `.oimo/workspace.yaml`。  
同等: `workspace.yml` / `workspace.json` / `workspace.jsonc`。

相対 `path` の基準:

- ファイルが `.oimo/` 配下 → **その親ディレクトリ**（Workspace / 主 checkout ルート）
- それ以外 → 設定ファイルのあるディレクトリ

### 2.1 トップレベル

| キー | 型 | 必須 | 意味 |
|------|----|------|------|
| `version` | `1` のみ | 必須 | スキーマ版。将来拡張用。 |
| `name` | string | 必須 | Workspace 表示名。 |
| `primary` | string | 必須 | `repositories[].id` のいずれか。主対象。 |
| `repositories` | array（1 件以上） | 必須 | 登録リポ一覧。 |
| `defaults` | object | 任意 | 未登録パスや横断計画の既定ポリシー。 |

### 2.2 `repositories[]` の各要素

| キー | 型 | 必須 | 意味 |
|------|----|------|------|
| `id` | string | 必須 | 安定識別子（`backend` 等）。結果表示は `id:相対パス`。 |
| `path` | string | 必須 | 絶対パス、または上記基準からの相対パス。**Git リポなら worktree ルート**（サブディレクトリ不可）。 |
| `role` | string | 任意 | 役割の説明（「REST API」「Web UI」など）。 |
| `access` | `read-only` \| `read-write` | 任意 | 書込可否。省略時は `kind` 依存（下表）。 |
| `kind` | 下表 | 任意 | リポの種類。省略時 `git`。 |

#### `kind`

| 値 | 意味 | 既定 `access` |
|----|------|----------------|
| `git` | 独立した Git checkout。`.git` がルートにあること。 | `read-write` |
| `directory` | Git ではない補助ディレクトリ（ドキュメント置き場など）。**明示が必須**。 | `read-only` |
| `superproject` | `.gitmodules` を持つ親（通常は自動検出で付与）。アプリ実装先にしない。 | `read-only` |
| `submodule` | superproject 配下の submodule（通常は自動検出）。 | `read-write` |

#### `access`

| 値 | 挙動 |
|----|------|
| `read-write` | 登録済みなら編集・書込ツール可（Execution scope 導入後も scope 内が前提）。 |
| `read-only` | 読取・検索は可、書込は Resolver が拒否（例: infra）。 |

### 2.3 `defaults`

| キー | 型 | 省略時 | 意味 |
|------|----|--------|------|
| `allow_unregistered_reads` | bool | `false` | `true` でも Phase 1 では未登録読取を安易に広げない方針。将来の緩和用。 |
| `allow_unregistered_writes` | bool | `false` | 未登録パスへの書込。`true` は非推奨（doctor が警告）。 |
| `require_cross_repo_plan` | bool | `true` | 複数リポへの書込前に横断計画を要求する方針フラグ（Phase 4 で強制が本格化）。 |

### 2.4 検証ルール（ロード時）

- `primary` が一覧に無い → エラー
- `id` 重複 / 正規化後パス重複 → エラー
- `kind: git` なのに Git ルートでない、またはサブディレクトリ → エラー
- `kind: directory` なのに Git ルート → エラー（`kind: git` を使え）
- 兄弟リポ同士の入れ子 → エラー（**superproject ⊃ submodule は例外で許可**）

### 2.5 最小例

```yaml
version: 1
name: customer-platform
primary: backend
repositories:
  - id: backend
    path: .
    role: REST API and domain logic
  - id: frontend
    path: ../frontend
    role: Web UI
  - id: infra
    path: ../customer-infra
    role: deployment
    access: read-only
  - id: notes
    path: ../notes
    kind: directory
    access: read-only
defaults:
  allow_unregistered_writes: false
  require_cross_repo_plan: true
```

サンプル: `docs/multi-repo/samples/siblings-yaml/workspace.yaml`

---

## 3. `.gitmodules`（Git submodule superproject）

標準の Git 設定ファイル。oimo 用の独自キーは増やさない。  
`workspace.yaml` / `repos.txt` が**無い**とき、起点ディレクトリに `.gitmodules` があると自動で Workspace 化する。

### 3.1 Git が使うキー（oimo が読むもの）

各 `[submodule "<name>"]` セクション:

| キー | 必須（Git） | oimo での意味 |
|------|-------------|---------------|
| （セクション名）`name` | 実質必須 | submodule 論理名。id の候補。 |
| `path` | 必須 | superproject ルートからの相対パス。checkout 位置。 |
| `url` | 推奨 | clone / 追跡用リモート。role 文言にも使う。 |
| `branch` | 任意 | 追跡したいブランチ名。behind 判定のヒント（ローカルに `origin/<branch>` がある場合のみ。**fetch はしない**）。 |

サンプル: `docs/multi-repo/samples/superproject/gitmodules.sample`

### 3.2 oimo が自動登録する内容

| Registry 上 | `kind` | 既定 `access` | 役割 |
|-------------|--------|---------------|------|
| 親ディレクトリ（basename を id に） | `superproject` | `read-only` | ポインタ管理・Workspace の器。アプリ実装の主戦場にしない。 |
| 各 submodule | `submodule` | `read-write` | 実装・commit・PR の単位。 |

- **primary:** 初期化済み submodule があればその先頭、無ければ一覧上の先頭 submodule（superproject 自身は primary にしない方針）。
- **入れ子:** 通常の兄弟登録では禁止される「親の中の別 Git」を、superproject/submodule 関係として許可。

### 3.3 検査する状態（ネットワーク無し・ローカルのみ）

各 submodule について doctor / 指紋が持つ情報:

| 項目 | 意味 |
|------|------|
| recorded commit | superproject の gitlink（`ls-tree`）が指す commit |
| checked-out commit | submodule 作業ツリーの `HEAD` |
| tracking branch | `.gitmodules` の `branch` |
| remote | submodule 内の `git remote` |
| initialized | 配下に `.git` があるか |
| dirty | `git status --porcelain` が空でないか |
| commit mismatch | recorded ≠ checked-out → 影響分析に警告 |
| behind tracking | ローカル `origin/<branch>` より後ろ → 警告（自動更新しない） |

### 3.4 運用上の約束

1. コード変更・commit・PR は **各 submodule 内**で行う。  
2. superproject の submodule ポインタ更新は **別 Change set / 別 Step**。  
3. `git submodule update` / `checkout` / `remote update` は **自動実行しない**。ネットワークと作業ツリーへの影響を説明して承認を取る。  
4. 未初期化のまま影響分析を続ける場合は警告を残す。

### 3.5 手動で YAML に書く場合

通常は不要。明示するなら:

```yaml
version: 1
name: monorepo-super
primary: backend
repositories:
  - id: monorepo-super
    path: .
    kind: superproject
    access: read-only
  - id: backend
    path: backend
    kind: submodule
  - id: frontend
    path: frontend
    kind: submodule
```

---

## 4. 形式の選び方

| 状況 | 推奨 |
|------|------|
| GitHub 上の複数リポを並べてすぐ始めたい | `repos.txt` |
| 相対パス・役割・directory 補助を細かく指定したい | `workspace.yaml` |
| 既に Git submodule でシステムを束ねている | `.gitmodules` のまま（追加設定なし） |
| YAML と repos.txt が両方ある | **YAML が勝つ**（発見順） |

詳細な利用手順・安全規則: 同ディレクトリの [README.md](./README.md)
