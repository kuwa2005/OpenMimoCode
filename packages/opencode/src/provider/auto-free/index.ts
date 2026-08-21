export {
  AUTO_PROVIDER_ID,
  AUTO_FREE_MODEL_ID,
  AUTO_FREE_REF,
  AUTO_PAID_MODEL_ID,
  AUTO_HYBRID_MODEL_ID,
  catalog,
  isAutoFreeRef,
  isAutoFreeModel,
  looksFreeTier,
} from "./catalog"
export type { AutoFreeCandidate, AutoFreeCatalog } from "./catalog"
export { resolveAutoFreeCandidates, ZEN_FREE_PREFERRED_ORDER } from "./resolve"
export {
  isCommitStreamEvent,
  classifyFailoverFailure,
  runWithFailover,
} from "./failover"
export { FCC_TO_OIMO_PROVIDER, mapFccProvider, fccRefToOimo, parseFccRef } from "./provider-map"
export { FREE_SETUP_PROVIDERS, freeSetupProvider } from "./setup-providers"
export type { FreeSetupProvider } from "./setup-providers"

import { AUTO_PROVIDER_ID, AUTO_FREE_MODEL_ID } from "./catalog"
import { ProviderID, ModelID } from "../schema"
import type { Model, Info } from "../provider"

/** Synthetic provider entry so TUI / API can list Auto (free). */
export function autoFreeProviderInfo(): Info {
  const model = autoFreeVirtualModel()
  return {
    id: ProviderID.make(AUTO_PROVIDER_ID),
    name: "Auto",
    source: "custom",
    env: [],
    options: {},
    models: {
      [AUTO_FREE_MODEL_ID]: model,
    },
  }
}

export function autoFreeVirtualModel(): Model {
  return {
    id: ModelID.make(AUTO_FREE_MODEL_ID),
    providerID: ProviderID.make(AUTO_PROVIDER_ID),
    name: "Auto (無料)",
    family: "auto",
    api: {
      id: AUTO_FREE_MODEL_ID,
      url: "",
      npm: "@ai-sdk/openai-compatible",
    },
    status: "active",
    headers: {},
    options: {},
    cost: {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 },
    },
    limit: {
      context: 128_000,
      output: 32_000,
    },
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: false, image: true, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    release_date: "",
    variants: {},
  }
}
