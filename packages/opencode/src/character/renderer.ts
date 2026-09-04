import type { StructuredFriction } from "@/friction/types"
import { CharacterMode, type CharacterMode as Mode } from "./mode"
import { renderDefault, renderDefaultUser } from "./modes/default"
import { renderOff } from "./modes/off"

/**
 * Presentation only. Must not change friction_type, responsibility, scope, or rules.
 */
export function renderFrictionBody(friction: StructuredFriction, mode: Mode): string {
  return mode === CharacterMode.Off ? renderOff(friction) : renderDefault(friction)
}

/** Shorter copy for TUI (user-visible friction feedback). */
export function renderFrictionUserBody(friction: StructuredFriction, mode: Mode): string {
  return mode === CharacterMode.Off ? renderOff(friction) : renderDefaultUser(friction)
}

export function renderFriction(friction: StructuredFriction, mode: Mode): string {
  return `<system-reminder>\n${renderFrictionBody(friction, mode)}\n</system-reminder>`
}

export * from "./mode"
