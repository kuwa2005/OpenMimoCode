import type { Model } from "../provider"
import { ProviderID, ModelID } from "../schema"
import { catalog, looksFreeTier, type AutoFreeCandidate } from "./catalog"

export type AutoFreeResolveInput = {
  /** User override from config.auto_free.fallbacks */
  fallbacks?: string[]
  /** Loaded providers keyed by id */
  providers: Record<string, { models: Record<string, Model> }>
}

/**
 * Preferred try-order among OpenCode Zen free (cost.input === 0) models.
 * Unknown free models are appended alphabetically after these.
 * Zero-config users get this whole set without API keys (Zen public pool).
 */
export const ZEN_FREE_PREFERRED_ORDER = [
  "big-pickle",
  "grok-code",
  "nemotron-3-super-free",
  "nemotron-3-ultra-free",
  "deepseek-v4-flash-free",
  "qwen3.6-plus-free",
  "kimi-k2.5-free",
  "glm-5-free",
  "glm-4.7-free",
  "minimax-m3-free",
  "minimax-m2.5-free",
  "minimax-m2.1-free",
  "mimo-v2-pro-free",
  "mimo-v2.5-free",
  "mimo-v2-omni-free",
  "mimo-v2-flash-free",
  "trinity-large-preview-free",
  "laguna-s-2.1-free",
  "north-mini-code-free",
  "ring-2.6-1t-free",
  "hy3-free",
  "hy3-preview-free",
  "longcat-2.0-free",
  "ling-3.0-flash-free",
  "ling-2.6-flash-free",
  "ling-3.0-tiny-free",
] as const

function parseRef(ref: string) {
  const [providerID, ...rest] = ref.split("/")
  if (!providerID || rest.length === 0) return undefined
  return { providerID: ProviderID.make(providerID), modelID: ModelID.make(rest.join("/")) }
}

function lookup(providers: AutoFreeResolveInput["providers"], ref: string): Model | undefined {
  const parsed = parseRef(ref)
  if (!parsed) return undefined
  const provider = providers[parsed.providerID]
  if (!provider) return undefined
  const model = provider.models[parsed.modelID]
  if (!model) return undefined
  if (model.status === "deprecated") return undefined
  return model
}

function seedRefs(fallbacks?: string[]): string[] {
  if (fallbacks && fallbacks.length > 0) return fallbacks
  return catalog.candidates.map((c: AutoFreeCandidate) => c.ref)
}

function zenFreeRank(modelID: string) {
  const idx = (ZEN_FREE_PREFERRED_ORDER as readonly string[]).indexOf(modelID)
  return idx === -1 ? 1000 : idx
}

function appendZenFreePool(
  providers: AutoFreeResolveInput["providers"],
  seen: Set<string>,
  out: Model[],
) {
  const zen = providers["opencode"]
  if (!zen) return
  const free = Object.values(zen.models)
    .filter((m) => m.cost.input === 0 && m.status !== "deprecated" && m.id !== "big-pickle-api")
    .sort((a, b) => {
      const ra = zenFreeRank(a.id)
      const rb = zenFreeRank(b.id)
      if (ra !== rb) return ra - rb
      return a.id.localeCompare(b.id)
    })
  for (const model of free) {
    const key = `${model.providerID}/${model.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(model)
  }
}

/**
 * Build ordered upstream candidates for Auto (free).
 *
 * 1. User `auto_free.fallbacks` or FCC-synced catalog (keyed providers when available)
 * 2. **All loaded OpenCode Zen free models** (cost.input === 0) — zero-config, no API key
 * 3. Last resort: big-pickle if somehow still empty
 *
 * Only models that are currently loaded are kept. Zen free models autoload with
 * `apiKey: "public"`, so a clean install gets a long free failover chain with no setup.
 */
export function resolveAutoFreeCandidates(input: AutoFreeResolveInput): Model[] {
  const seen = new Set<string>()
  const out: Model[] = []

  for (const ref of seedRefs(input.fallbacks)) {
    const model = lookup(input.providers, ref)
    if (!model) continue
    const key = `${model.providerID}/${model.id}`
    if (seen.has(key)) continue
    if (model.providerID === "opencode" && model.cost.input > 0 && !ref.endsWith(":free")) continue
    if (!looksFreeTier(ref, model.cost.input) && model.providerID === "opencode") continue
    seen.add(key)
    out.push(model)
  }

  // Zero-config backbone: every Zen free model currently loaded.
  appendZenFreePool(input.providers, seen, out)

  if (out.length === 0) {
    const pickle = lookup(input.providers, "opencode/big-pickle")
    if (pickle) out.push(pickle)
  }

  return out
}
