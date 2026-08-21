/**
 * Map Free Claude Code (FCC) provider_id → Open Mimo Code provider id.
 * Unknown FCC ids are skipped by the sync script / resolver (fail closed).
 */
export const FCC_TO_OIMO_PROVIDER: Record<string, string> = {
  nvidia_nim: "nvidia",
  open_router: "openrouter",
  opencode_zen: "opencode",
  opencode_go: "opencode",
  groq: "groq",
  gemini: "google",
  mistral: "mistral",
  deepseek: "deepseek",
  xai: "xai",
  together: "together",
  fireworks: "fireworks",
  cerebras: "cerebras",
  huggingface: "huggingface",
  cohere: "cohere",
  github_models: "github-models",
  vercel: "vercel",
  cloudflare: "cloudflare-ai-gateway",
  ollama: "ollama",
  lmstudio: "lmstudio",
  openai: "openai",
  anthropic: "anthropic",
  zai: "zai",
  minimax: "minimax",
  kimi: "kimi-coding",
  siliconflow: "siliconflow",
  novita: "novita",
  deepinfra: "deepinfra",
  sambanova: "sambanova",
  nebius: "nebius",
}

export function mapFccProvider(fccProviderId: string): string | undefined {
  return FCC_TO_OIMO_PROVIDER[fccProviderId]
}

export function parseFccRef(ref: string): { fccProvider: string; model: string } | undefined {
  const slash = ref.indexOf("/")
  if (slash <= 0) return undefined
  return {
    fccProvider: ref.slice(0, slash),
    model: ref.slice(slash + 1),
  }
}

export function fccRefToOimo(ref: string): string | undefined {
  const parsed = parseFccRef(ref)
  if (!parsed) return undefined
  const provider = mapFccProvider(parsed.fccProvider)
  if (!provider) return undefined
  return `${provider}/${parsed.model}`
}
