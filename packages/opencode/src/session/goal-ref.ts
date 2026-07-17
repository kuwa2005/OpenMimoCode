import type { SessionID } from "./schema"

export type GoalPhase = "hearing" | "execute"

/**
 * Process-global bridge so the question tool can advance goal phase
 * (hearing → execute) without ToolRegistry depending on Goal.Service
 * (which would create a layer cycle via SessionPrompt ↔ ToolRegistry).
 */
type SetPhase = (sessionID: SessionID, phase: GoalPhase) => void

let setPhaseImpl: SetPhase | undefined

export const goalRef = {
  register(fn: SetPhase) {
    setPhaseImpl = fn
  },
  setPhase(sessionID: SessionID, phase: GoalPhase) {
    setPhaseImpl?.(sessionID, phase)
  },
}
