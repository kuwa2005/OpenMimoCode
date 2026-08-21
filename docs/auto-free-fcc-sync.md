# Auto (無料) カタログと Free Claude Code の同期

Open Mimo Code の `auto/free` は **内製の first-frame フォールバック**で動く。Free Claude Code（FCC）はランタイム依存ではなく、**無料候補カタログの上流**として定期取り込みする。

将来の `auto/paid` / `auto/hybrid`（無料を使い、能力不足で有料へ）は [auto-mode-roadmap.md](./auto-mode-roadmap.md) を参照。

## 境界

| 取り込む | 取り込まない |
|----------|----------------|
| 無料向けデフォルト / smoke 既知の `provider/model` 候補 | Python `ProviderExecutor` / Admin UI |
| FCC `provider_id` → OIMO provider id マップ更新 | Anthropic / Responses wire 変換 |
| ドキュメント上の MODEL_FALLBACKS 例のうち無料寄り | クライアント向け proxy ランチャ |

Failover 状態機械（first-frame コミット）は OIMO の TypeScript が所有する。仕様の参照元は FCC の `docs/provider-failover-and-routing.md`。

## 同期手順

```bash
# 既定: ../free-claude-code（このリポジトリの隣）
bun script/sync-auto-free-catalog.ts

# パス指定
FCC_ROOT=/home/ubuntu/workspace/free-claude-code bun script/sync-auto-free-catalog.ts
```

出力: [`packages/opencode/src/provider/auto-free-catalog.json`](../packages/opencode/src/provider/auto-free-catalog.json)

マップ: [`packages/opencode/src/provider/auto-free/provider-map.ts`](../packages/opencode/src/provider/auto-free/provider-map.ts)

## 差分レビュー観点

1. 新しい FCC provider_id が未マップで warn されていないか → マップに追加するか意図的スキップか
2. 候補に有料モデルが混入していないか（`:free` / Zen `cost.input===0` / 明示 note）
3. `opencode/big-pickle` が先頭付近に残っているか（ゼロ設定動作）
4. ToS 非準拠・スクレイプ系 endpoint を入れていないか（FCC 方針に合わせる）

## ランタイム上書き

`oimo.json`:

```json
{
  "auto_free": {
    "fallbacks": [
      "opencode/big-pickle",
      "openrouter/openai/gpt-oss-120b:free"
    ]
  }
}
```

設定がある場合はカタログの先頭列より優先。その後も **ロード済みの OpenCode Zen 無料モデル（`cost.input === 0`）は自動で末尾に追加**される。

## ゼロ設定で使えるもの

キーやログインなしでも、OpenCode Zen の無料プール（`apiKey: "public"`）上の全無料モデルが Auto(無料) の候補になる。設定不要で first-frame フォールバックが効く。

FCC 由来の OpenRouter / NVIDIA / Groq などは、利用者がキーを入れたときだけ候補に乗る（ボーナス）。

## アカウント＋APIキー設定ヘルパー

「無料」でも各社サイトでのアカウント作成が必要なプロバイダ向け:

- TUI: `/free-setup` またはモデル選択の「無料プロバイダのキーを追加…」
- 実装: `dialog-auto-free-setup.tsx` + `auto-free/setup-providers.ts`
- 流れ: 登録 URL をブラウザで開く → API キー貼り付け → `auth.set` → Auto(無料) 候補に反映

| プロバイダ | 登録 URL |
|-----------|----------|
| OpenRouter | https://openrouter.ai/keys |
| NVIDIA NIM | https://build.nvidia.com/settings/api-keys |
| Groq | https://console.groq.com/keys |
