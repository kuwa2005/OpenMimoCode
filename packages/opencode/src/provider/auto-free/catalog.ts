import catalogJson from "../auto-free-catalog.json"

export const AUTO_PROVIDER_ID = "auto"
export const AUTO_FREE_MODEL_ID = "free"
export const AUTO_FREE_REF = `${AUTO_PROVIDER_ID}/${AUTO_FREE_MODEL_ID}`

/** Reserved for a future paid-only Auto mode. See docs/auto-mode-roadmap.md */
export const AUTO_PAID_MODEL_ID = "paid"
/** Reserved for free-then-paid escalation Auto. See docs/auto-mode-roadmap.md */
export const AUTO_HYBRID_MODEL_ID = "hybrid"

export type AutoFreeCandidate = {
  ref: string
  tier: "free"
  note?: string
}

export type AutoFreeCatalog = {
  version: number
  tier: "free"
  source: string
  updated_at: string
  candidates: AutoFreeCandidate[]
}

export const catalog = catalogJson as AutoFreeCatalog

export function isAutoFreeRef(providerID: string, modelID: string) {
  return providerID === AUTO_PROVIDER_ID && modelID === AUTO_FREE_MODEL_ID
}

export function isAutoFreeModel(model: { providerID: string; id: string }) {
  return isAutoFreeRef(model.providerID, model.id)
}

/** Conservative free-tier heuristics for runtime filtering beyond catalog tags. */
export function looksFreeTier(ref: string, costInput?: number) {
  if (ref.endsWith(":free")) return true
  if (ref.startsWith("opencode/") && (costInput === undefined || costInput === 0)) return true
  return false
}
