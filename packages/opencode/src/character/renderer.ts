import type { StructuredFriction } from "@/friction/types"
import { CharacterMode, type CharacterMode as Mode } from "./mode"
import { renderDefault } from "./modes/default"
import { renderOff } from "./modes/off"

/**
 * Presentation only. Must not change friction_type, responsibility, scope, or rules.
 */
export function renderFriction(friction: StructuredFriction, mode: Mode): string {
  const body = mode === CharacterMode.Off ? renderOff(friction) : renderDefault(friction)
  return `<system-reminder>\n${body}\n</system-reminder>`
}

export * from "./mode"
