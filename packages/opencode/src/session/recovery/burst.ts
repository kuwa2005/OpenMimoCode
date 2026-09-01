import type { SessionID } from "../schema"
import { recordRecovery } from "./log"
import { SESSION_ERROR_BURST_MS } from "./constants"

const burst = new Map<SessionID, number>()

export function shouldPublishSessionError(sessionID: SessionID, now: number) {
  const lastBurst = burst.get(sessionID)
  if (lastBurst != null && now - lastBurst < SESSION_ERROR_BURST_MS) return false
  burst.set(sessionID, now)
  return true
}

export function gateSessionErrorPublish(sessionID: SessionID, now: number) {
  if (shouldPublishSessionError(sessionID, now)) return true
  recordRecovery({ event: "error.publish_suppressed", sessionID, source: "server" })
  return false
}

/** Test-only: reset debounce state between cases. */
export function resetSessionErrorBurstForTest() {
  burst.clear()
}
