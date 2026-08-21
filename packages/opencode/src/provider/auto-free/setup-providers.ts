/**
 * Free-tier providers that usually need a website account + API key
 * before Auto (free) can use their quota. OpenCode Zen public pool does NOT
 * need this — it works with apiKey "public" and no signup.
 */

export type FreeSetupProvider = {
  id: string
  name: string
  /** Human-readable free-tier blurb */
  blurb: string
  /** Where to create an account / get a free key */
  signupUrl: string
  /** Env var name documented by models.dev (hint only) */
  envHint?: string
  /** Catalog refs that become available once this provider is connected */
  unlocks?: string[]
}

/** Ordered for Auto (free) expansion — strongest free quotas first. */
export const FREE_SETUP_PROVIDERS: FreeSetupProvider[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    blurb: "無料モデル（:free）を多数利用可能。アカウント作成後に API キーを発行。",
    signupUrl: "https://openrouter.ai/keys",
    envHint: "OPENROUTER_API_KEY",
    unlocks: [
      "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
      "openrouter/openai/gpt-oss-120b:free",
      "openrouter/poolside/laguna-m.1:free",
    ],
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    blurb: "NVIDIA の無料 API（NIM）。build.nvidia.com でキーを取得。",
    signupUrl: "https://build.nvidia.com/settings/api-keys",
    envHint: "NVIDIA_API_KEY",
    unlocks: ["nvidia/nvidia/nemotron-3-super-120b-a12b"],
  },
  {
    id: "groq",
    name: "Groq",
    blurb: "高速推論の無料枠。console.groq.com でキーを取得。",
    signupUrl: "https://console.groq.com/keys",
    envHint: "GROQ_API_KEY",
    unlocks: ["groq/llama-3.3-70b-versatile"],
  },
]

export function freeSetupProvider(id: string) {
  return FREE_SETUP_PROVIDERS.find((p) => p.id === id)
}
