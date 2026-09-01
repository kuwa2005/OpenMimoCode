import type { SessionID } from "./schema"

/** Suppress duplicate prompt_async session.error publishes from one failure tick. */
export const PROMPT_ASYNC_ERROR_DEBOUNCE_MS = 3_000

const burst = new Map<SessionID, number>()

export function shouldPublishPromptAsyncError(sessionID: SessionID, now: number) {
  const lastBurst = burst.get(sessionID)
  if (lastBurst != null && now - lastBurst < PROMPT_ASYNC_ERROR_DEBOUNCE_MS) return false
  burst.set(sessionID, now)
  return true
}

/** Test-only: reset debounce state between cases. */
export function resetPromptAsyncErrorBurstForTest() {
  burst.clear()
}
