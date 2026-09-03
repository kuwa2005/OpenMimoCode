import type { FrictionMode } from "./types"
import { Flag } from "@/flag/flag"
import { CharacterMode, parseCharacterMode, type CharacterMode as CharMode } from "@/character/mode"

export * from "./types"
export * from "./detector"
export * from "./classifier"
export * from "./process"
export * from "./store"
export * from "./rules"
export * from "./evolve-bridge"

export function frictionModesFromFlag(): FrictionMode[] {
  const modes: FrictionMode[] = []
  if (Flag.MIMOCODE_FRICTION_SE) modes.push("se")
  if (Flag.MIMOCODE_FRICTION_FDE) modes.push("fde")
  if (modes.length) return [...new Set(modes)]
  // Fallback when only legacy autonomy/FDE env is set without explicit friction flags
  if (Flag.MIMOCODE_FDE) return ["fde"]
  if (Flag.MIMOCODE_AUTONOMY && !Flag.MIMOCODE_SPAUTO) return ["se"]
  return []
}

export function frictionLearningEnabled(): boolean {
  return frictionModesFromFlag().length > 0
}

export function characterModeFromFlag(): CharMode {
  try {
    return parseCharacterMode(Flag.MIMOCODE_CHARACTER)
  } catch {
    return CharacterMode.Default
  }
}

export { CharacterMode }
