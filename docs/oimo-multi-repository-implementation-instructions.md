# oimo マルチリポジトリ対応 実装指示書

## 1. この指示書の目的

既存のAIコーディングエージェント `oimo` に、複数の独立したGitリポジトリを一つのシステムとして認識し、横断的に調査・影響分析・変更・検証できる機能を実装する。

今回実現するものは、単に複数ディレクトリを検索できる機能ではない。利用者が「このAPI仕様を変更して」「ログイン処理をOAuth2対応にして」のように業務機能・システム単位で依頼したとき、oimo自身が関連リポジトリを特定し、依存関係と変更範囲を説明し、安全に実装できる状態を目標とする。

基本思想は次のとおりとする。

> Repositoryを操作するAIから、Systemを保守するAIへ拡張する。

---

## 2. 最初に実施すること

実装前に既存コードを調査し、以下を文書化すること。推測で新しい基盤を作らず、既存の設計、命名、ツール実行、権限確認、セッション管理、TUI、`skills`、`workflows`、`evolve`、`dream` の仕組みを可能な限り再利用する。

1. oimoが現在「作業ディレクトリ」「Gitリポジトリ」「セッション」をどのように保持しているか
2. ファイル検索・読取・編集・コマンド実行の際にルート制約をどこで判定しているか
3. システムプロンプト、ツール定義、コンテキスト生成の入口
4. TUIで現在のリポジトリ名・ブランチ・変更状態を表示している箇所
5. セッション再開時に復元される情報と保存形式
6. `skills` と `workflows` が作業対象パスをどのように受け取るか
7. `evolve` が自己改変対象をどのように限定しているか
8. Git操作、差分取得、テスト実行、承認フローの既存実装

調査結果を `docs/multi-repo/current-architecture.md` に記録し、その後に実装計画を `docs/multi-repo/implementation-plan.md` として作成すること。既存コードの実態に応じて本指示書の型名や配置は変更してよいが、要件と安全条件は落とさないこと。

## 3. 用語定義

- **Repository**: `.git` を境界とする一つのGitリポジトリ
- **Workspace**: 一つのシステムとして扱う複数Repositoryの集合
- **Primary repository**: oimoを起動した、または利用者が主対象に指定したRepository
- **Repository registry**: Workspace内のRepository一覧と役割を保持する台帳
- **Dependency graph**: Repository間の依存・通信・成果物利用関係を表すグラフ
- **Change set**: 一つの依頼によって複数Repositoryに発生した変更の集合
- **Execution scope**: そのタスクで読取・編集・コマンド実行を許可されたRepository群

## 4. 必須ユースケース

最低限、次を実現すること。

### 4.1 Workspaceの登録と再利用

- 複数の既存ローカルRepositoryを一つのWorkspaceとして登録できる。
- 相対パスと絶対パスの両方を受け付けるが、保存時は正規化する。
- Workspace設定をプロジェクト側の設定ファイルとして保存し、次回起動時に再利用できる。
- 登録時にRepositoryの存在、Gitルート、重複、入れ子、アクセス可否を検証する。
- Gitリポジトリでない補助ディレクトリは、明示的に `kind: directory` とした場合だけ読取対象として登録できる。

設定例。実際のファイル名は既存設定体系に合わせてよい。

```yaml
version: 1
name: customer-platform
primary: backend
repositories:
  - id: frontend
    path: ../customer-frontend
    role: Web UI
    access: read-write
  - id: backend
    path: .
    role: REST API and domain logic
    access: read-write
  - id: shared-schema
    path: ../shared-schema
    role: API schema and generated types
    access: read-write
  - id: infra
    path: ../customer-infra
    role: deployment and cloud resources
    access: read-only
defaults:
  allow_unregistered_reads: false
  allow_unregistered_writes: false
  require_cross_repo_plan: true
```

### 4.2 横断検索

- ファイル名、文字列、シンボル、設定キー、APIパス、DB項目を登録済みRepository全体から検索できる。
- 検索結果には必ずRepository IDとRepository相対パスを付ける。
- 同名ファイルや同名シンボルを混同しない。
- `.gitignore`、既存の除外設定、巨大ファイル、バイナリ、秘密情報候補を考慮する。
- 検索対象を `all`、特定Repository、read-writeのみ等で絞り込める。
- 検索結果をすべてLLMへ投入せず、候補抽出、ランキング、必要箇所の読取という段階処理にする。

### 4.3 Repository間依存の検出

次の情報源を解析し、確信度と根拠付きでDependency graphを生成する。

- package manifestとlock file
- workspace設定
- import、package名、ローカルパス依存
- OpenAPI、GraphQL、Protocol Buffers等の契約
- HTTP URL、ルート、クライアント生成設定
- Docker Compose、Kubernetes、Terraform、CI/CD設定
- DB migration、schema、ORMモデル
- イベント名、queue、topic、consumer/producer
- README、architecture document、ADR

自動検出結果と利用者が明示した関係を区別すること。推測した依存を事実として扱わない。

依存関係には最低限、次の情報を持たせる。

```ts
type RepositoryEdge = {
  from: RepositoryId
  to: RepositoryId
  kind: 'build' | 'runtime' | 'api' | 'schema' | 'event' | 'deploy' | 'docs' | 'unknown'
  evidence: Array<{ repositoryId: RepositoryId; path: string; line?: number; description: string }>
  confidence: 'confirmed' | 'high' | 'medium' | 'low'
  source: 'declared' | 'detected' | 'user'
}
```

### 4.4 影響分析

利用者の依頼に対し、編集前に次を行う。

1. 起点となる仕様、シンボル、API、schema、設定を特定
2. 直接参照箇所を全Repositoryから検索
3. Dependency graphを使って間接影響候補を列挙
4. production code、test、generated code、docs、infraに分類
5. 変更が必要、確認が必要、影響なし、判断不能に分類
6. 根拠ファイルを示したCross-repository change planを生成

計画表示例。

```text
変更対象
- shared-schema: OpenAPI schemaと生成元を更新
- backend: DTO、handler、contract testを更新
- frontend: generated type、API adapter、画面テストを更新

確認のみ
- infra: API gateway設定には該当項目なし

実行順序
1. shared-schema
2. backend
3. frontend
```

複数Repositoryへの書込みが発生する場合、既存の承認方式に統合して変更計画を提示する。自動承認モードが既に存在する場合も、計画と対象Repositoryはログへ残す。

### 4.5 横断変更

- Execution scope外のRepositoryには書き込まない。
- read-only指定のRepositoryには書き込まない。
- 各編集結果にRepository IDを保持する。
- schemaや生成元がある場合、生成物だけを直接修正せず、生成元を更新して既存の生成コマンドを使う。
- Repositoryごとの規約ファイル、AGENTS.md、CONTRIBUTING.md、lint/test設定を個別に適用する。
- 一つのRepositoryのルールを他Repositoryへ無条件に流用しない。
- 途中で一部の変更に失敗した場合、成功済み変更を隠さず、Change setを `complete`、`partial`、`failed`、`cancelled` のいずれかで記録する。
- 自動的なcommit、push、PR作成は既存の権限・承認ルールに従い、今回の機能追加だけを理由に有効化しない。

### 4.6 Repositoryごとの検証と統合検証

- 各Repositoryで適切なformat、lint、typecheck、unit test、buildを検出して実行できる。
- コマンドの作業ディレクトリを必ず明示し、別Repositoryで誤実行しない。
- 依存順に検証する。
- 可能な場合は契約テストまたは統合テストを最後に実行する。
- テストが存在しない、実行不能、環境変数不足、外部サービス依存の場合は「成功」扱いにしない。
- 結果をRepository単位とChange set全体の両方で集約する。

最終報告には少なくとも以下を含める。

- 変更したRepository
- Repositoryごとの変更ファイル
- 実行した検証と結果
- 実行できなかった検証と理由
- 残存リスク
- commitまたはPRを作成した場合はRepositoryごとの識別情報

## 5. アーキテクチャ要件

### 5.1 単一のcwd依存を除去する

既存実装にグローバルな `cwd`、`repoRoot`、`gitRoot` への暗黙依存がある場合、すべてを一括置換してはならない。境界インターフェースを導入し、段階的にRepository-awareへ移行する。

推奨する中核モデルは次のとおり。

```ts
type RepositoryId = string

type RepositoryDescriptor = {
  id: RepositoryId
  rootPath: string
  canonicalPath: string
  kind: 'git' | 'directory'
  role?: string
  access: 'read-only' | 'read-write'
  git?: {
    branch?: string
    head?: string
    remoteNames: string[]
    dirty: boolean
  }
}

type WorkspaceContext = {
  id: string
  name: string
  primaryRepositoryId: RepositoryId
  repositories: Map<RepositoryId, RepositoryDescriptor>
  dependencyGraph: RepositoryGraph
  executionScope: Set<RepositoryId>
}

type RepositoryLocation = {
  repositoryId: RepositoryId
  relativePath: string
}
```

ファイルを内部で参照するときは、可能な限り裸の絶対パスではなく `RepositoryLocation` を使う。OSアクセス直前に正規化済み絶対パスへ解決する。

### 5.2 Repository Resolver

次を担当する単一の解決層を作る。

- Repository IDからroot pathへの解決
- 任意パスから所属Repositoryへの逆引き
- symlink解決後の境界検査
- `..` を含むpath traversal防止
- 大文字小文字、Windows drive、UNC、WSL等を考慮した正規化
- 入れ子Repositoryの最長一致判定
- 未登録パスへのアクセス拒否

読取・書込・検索・shell・Gitの各ツールが独自にパス判定を実装しないよう、このResolverを共通利用する。

### 5.3 Tool層の変更

既存ツールとの後方互換を維持しつつ、次のようにRepository指定を追加する。

```ts
readFile({ repositoryId?, path })
writeFile({ repositoryId?, path, content })
search({ repositoryIds?, query, options? })
runCommand({ repositoryId?, command, args?, timeout? })
gitStatus({ repositoryId })
gitDiff({ repositoryId, base? })
```

`repositoryId` 省略時はPrimary repositoryを使い、既存の単一Repository動作を壊さない。ただし、検索や変更計画で `all repositories` を暗黙指定しない。横断操作は明示的なWorkspace toolまたは明示フラグを使う。

shell commandは文字列連結による `cd path && ...` を基本方式にせず、実行APIの `cwd` 引数へRepository rootを渡す。ログにもRepository IDを付ける。

### 5.4 Context構築

LLMへ毎回全Repositoryの全情報を渡さない。次の階層でコンテキストを作る。

1. Workspace summary
2. Repository registry
3. Dependency graphの関連部分
4. タスクに関連する検索結果
5. 必要なファイル本文

Repositoryごとに概要、主要言語、主要manifest、テストコマンド、規約、主要entry pointをキャッシュする。ファイル変更、HEAD変更、設定変更を検出したときだけ該当部分を無効化する。

### 5.5 セッションと永続化

セッションには最低限、以下を保存・復元する。

- Workspace IDと設定ファイルの位置
- Primary repository
- 登録Repository一覧
- 各Repositoryの開始時HEADとdirty状態
- Execution scope
- Dependency graphの版またはfingerprint
- Change setと承認状態
- Repository単位の変更・検証結果

Repositoryが移動・削除された場合は黙って別パスを推定せず、再解決を求める。開始時とHEADが変わった場合は依存グラフ、差分、変更計画の再評価を行う。

## 6. TUI要件

既存TUIへ過剰な新画面を増やさず、最低限次を追加する。

- 現在のWorkspace名
- Primary repository
- 登録Repository数
- Repositoryごとのaccess、branch、dirty状態
- 現在のExecution scope
- 検索結果・編集差分・コマンド出力のRepository識別表示
- Cross-repository change planの確認画面
- Repository別検証結果

同じファイル名が並んでも区別できるよう、表示は原則として `repo-id:path/to/file` とする。

推奨コマンド例。既存のコマンド体系に合わせて名称は調整してよい。

```text
/workspace init
/workspace add <path> [--id <id>] [--read-only]
/workspace remove <id>
/workspace list
/workspace graph
/workspace scope <id...|all>
/workspace refresh
/workspace doctor
```

## 7. Gitの扱い

複数Repositoryを一つの疑似Repositoryとして扱わない。Gitの境界は必ず維持する。

- status、diff、branch、commit、remoteはRepositoryごとに取得する。
- 作業開始時のHEADとdirty状態を記録する。
- 利用者の既存変更をoimoの変更として報告しない。
- 既存の未コミット変更を上書き・巻き戻し・stashしない。
- branch名がRepository間で異なっていても許容する。
- commitする場合はRepositoryごとに独立commitとする。
- 複数PRが必要な場合は依存順とマージ順を提示する。
- submodule、worktree、nested repositoryは検出し、通常の兄弟Repositoryと区別する。

Change setはGit commitとは別のoimo内部概念として保持する。これにより、3 Repositoryにまたがる一つの依頼を一単位として追跡できるようにする。

## 8. 安全要件

以下は必須とする。

1. 登録されていないRepositoryや親ディレクトリへ書き込まない。
2. symlink経由のWorkspace外書込みを拒否する。
3. read-only Repositoryへの書込みをツール層で拒否する。
4. `.env`、秘密鍵、credential、token候補をDependency graphやLLM contextへ不用意に取り込まない。
5. 横断検索結果に秘密値そのものを表示しない。
6. destructive command、migration、deployment、pushは既存の承認ルールを維持する。
7. 一つのRepositoryで許可された操作を他Repositoryへ自動拡張しない。
8. Repository追加時に、許可範囲が拡張されることを利用者へ明示する。
9. `evolve` がoimo自身を変更する場合も、対象Repositoryを明示し、顧客コードのRepositoryへ自己改変を混入させない。
10. 途中失敗時に自動で破壊的rollbackを行わない。差分と復旧案を提示する。

## 9. `skills`、`workflows`、`evolve`、`dream` との統合

### skills

- Skill metadataに対応scopeを持たせられるようにする。
- `single-repo`、`multi-repo`、`workspace-read-only` 等のcapabilityを宣言できるようにする。
- 既存Skillは指定がなければ `single-repo` として動作させ、後方互換を守る。

### workflows

- Stepごとに `repositoryId` または `repositorySelector` を指定できるようにする。
- 前Stepの出力から対象Repositoryを動的決定できるようにする。
- Repository間の依存順、並列実行可能性、失敗時の停止条件を表現できるようにする。
- 最終結果はChange setとして集約する。

### evolve

- マルチリポジトリ作業中に検出したoimo自身の問題点は、従来どおり改良提案または改造指示へ出力する。
- 顧客システムの修正とoimo自身の改造を同じChange setへ混在させない。
- 自己改変は明示的にoimo本体Repositoryを対象とした別タスクとして扱う。

### dream

- Repository固有の知識とWorkspace横断知識を分離して保存する。
- 一時的なbranch名、古いHEAD、過去の検出結果を永続的事実として固定しない。
- 記憶した依存関係には根拠、取得時点、confidenceを持たせる。

## 10. 段階的な実装順序

大規模な一括改修は禁止する。以下の順に、小さなPRまたは変更単位で実装・検証する。

### Phase 0: 現状調査と設計

- 既存アーキテクチャ調査
- 単一cwd依存箇所の一覧化
- 後方互換方針
- threat model
- 実装計画とテスト計画

### Phase 1: Workspace Registry

- 設定schema
- Repository登録・削除・一覧
- path正規化と境界検査
- セッション復元
- `/workspace doctor`

この時点では横断書込みを実装しない。

### Phase 2: 読取専用の横断探索

- 全Repository検索
- Repository別ファイル読取
- Workspace summary
- TUIのRepository識別表示
- context budget制御

### Phase 3: Dependency graphと影響分析

- manifest、API schema、infra等の検出器
- evidenceとconfidence
- graph cacheと更新
- Cross-repository impact report

### Phase 4: 計画付き横断編集

- Execution scope
- read-only enforcement
- Cross-repository change plan
- Repository-aware edit tools
- Change set追跡

### Phase 5: 横断検証

- Repository別コマンド検出
- 依存順実行
- 結果集約
- partial failure処理

### Phase 6: Git・workflow・evolve・dream統合

- Repository別diff/commit/PR情報
- workflow scope
- skill capability
- knowledge分離
- 自己改変境界

各Phase終了時に、既存の単一Repository利用が壊れていないことを回帰テストする。

## 11. テスト要件

unit testだけで完了としない。fixtureとして複数の小規模Repositoryを生成し、end-to-end testを行う。

最低限、次の構成を用意する。

```text
fixtures/multi-repo/
  frontend/
  backend/
  shared-schema/
  infra/
  outside-workspace/
```

必須テストケースは次のとおり。

1. 単一Repositoryモードが従来どおり動く
2. 3 Repositoryを登録して横断検索できる
3. 同名ファイルをRepository ID付きで区別できる
4. OpenAPI変更からbackendとfrontendの影響を検出できる
5. read-onlyのinfraに書き込もうとすると拒否される
6. 未登録のoutside-workspaceへの書込みが拒否される
7. symlinkを使った境界外書込みが拒否される
8. path traversalが拒否される
9. 一つのRepositoryでテスト失敗した場合に全体を成功扱いしない
10. 既存dirty fileを識別し、oimoの変更と混同しない
11. RepositoryのHEAD変更後に古い影響分析を使わない
12. 中断・再開後にWorkspaceとChange setが復元される
13. nested repo、submodule、worktreeを誤認しない
14. Windows/WSLをサポート対象とする場合、そのpath正規化を検証する
15. 大量検索結果を無制限にLLM contextへ投入しない

可能であれば、以下のシナリオをE2Eの合格基準とする。

> shared-schemaのAPI responseに `displayName` を追加せよ、と依頼する。oimoがshared-schema、backend、frontendを変更対象として特定し、infraは確認のみと判断する。計画承認後、生成元、実装、型、テスト、文書を適切な順序で更新し、Repository別と全体の検証結果を報告する。

## 12. 完了条件

以下をすべて満たした場合にのみ、マルチリポジトリ対応の初版を完了とする。

- Workspaceに複数Repositoryを安全に登録・復元できる
- 横断検索結果をRepository単位で追跡できる
- 根拠とconfidence付きのRepository依存グラフを生成できる
- 変更前に横断影響分析と実行順を提示できる
- Execution scopeとread-only制約がツール層で強制される
- 複数Repositoryの変更を一つのChange setとして管理できる
- RepositoryごとのGit境界と既存変更を保持できる
- Repository別検証と全体結果を正しく報告できる
- 途中失敗を成功と誤表示しない
- 単一Repository利用との後方互換がある
- 必須unit/integration/E2E testが通る
- 設定方法、操作方法、安全制約、既知の制限が文書化されている

## 13. 実装時の禁止事項

- 既存アーキテクチャを調べずに全面的な作り直しを始めない。
- すべてのRepositoryを一つの巨大なプロンプトへ投入しない。
- 文字列のpath prefix比較だけで境界判定しない。
- `cd` の連結だけでRepositoryを切り替えない。
- 全Repositoryへ無条件に書込み権限を与えない。
- dirtyな作業ツリーを自動でstash、reset、checkoutしない。
- generated fileだけを直接編集して完了にしない。
- 検出した依存関係を根拠なしで確定扱いしない。
- テスト未実行をテスト成功として表示しない。
- 複数Repositoryを一つのGit commitへまとめようとしない。
- マルチリポジトリ機能の実装と無関係な大規模リファクタリングを混在させない。

## 14. AIコーディングエージェントへの最終指示

この実装は、機能数よりも境界の正確さと説明可能性を優先すること。

まず既存コードを調査し、現状設計、変更候補、互換性リスクを報告する。その後、Phase 1から順に実装する。各Phaseで、変更ファイル、設計判断、テスト結果、残課題を示し、動作確認が取れてから次へ進むこと。

不明点があっても安易に新しい仕組みを並立させず、既存の抽象化へ統合可能かを先に調べる。一方、安全境界、Git境界、Repository識別が既存設計では表現できない場合は、最小の新しい抽象化を追加する。

最終的に利用者が次のように指示できる状態を作ること。

> この業務機能がどのRepositoryで実現されているか調べ、変更の影響範囲を根拠付きで示してください。計画を提示し、許可されたRepositoryだけを変更し、各Repositoryとシステム全体を検証してください。

