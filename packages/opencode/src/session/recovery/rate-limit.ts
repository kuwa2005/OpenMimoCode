import {
  RATE_LIMIT_AUTO_RETRY_INITIAL_MS,
  RATE_LIMIT_AUTO_RETRY_MAX,
  RATE_LIMIT_STORM_RESET_MS,
  SESSION_ERROR_BURST_MS,
} from "./constants"

export type RateLimitRecoverEntry = {
  attempts: number
  stormStartedAt: number
  lastBurstAt: number
}

export type RateLimitRecoverPlan =
  | { action: "ignore_burst" }
  | { action: "ignore_pending" }
  | { action: "skip_done" }
  | { action: "stop_max" }
  | { action: "schedule"; delayMs: number; attempt: number }

export function rateLimitRetryDelayMs(attempt: number) {
  return RATE_LIMIT_AUTO_RETRY_INITIAL_MS * Math.pow(2, attempt)
}

export function planRateLimitRecover(input: {
  state: RateLimitRecoverEntry | undefined
  now: number
  hasPendingTimer: boolean
  /** Last assistant already handed control back — do not auto-kick. */
  assistantDoneOrWaiting?: boolean
}): RateLimitRecoverPlan {
  if (input.assistantDoneOrWaiting) return { action: "skip_done" }

  if (input.state && input.now - input.state.lastBurstAt < SESSION_ERROR_BURST_MS) {
    return { action: "ignore_burst" }
  }

  const stormAge = input.state ? input.now - input.state.stormStartedAt : 0
  const attempts =
    input.state && stormAge < RATE_LIMIT_STORM_RESET_MS ? input.state.attempts : 0

  if (attempts >= RATE_LIMIT_AUTO_RETRY_MAX) return { action: "stop_max" }

  if (input.hasPendingTimer) return { action: "ignore_pending" }

  return { action: "schedule", delayMs: rateLimitRetryDelayMs(attempts), attempt: attempts + 1 }
}

export function nextRateLimitRecoverState(
  state: RateLimitRecoverEntry | undefined,
  now: number,
): RateLimitRecoverEntry {
  const freshStorm = !state || now - state.stormStartedAt >= RATE_LIMIT_STORM_RESET_MS
  return {
    attempts: freshStorm ? 0 : state.attempts,
    stormStartedAt: freshStorm ? now : state.stormStartedAt,
    lastBurstAt: now,
  }
}

export function afterRateLimitRetrySent(state: RateLimitRecoverEntry): RateLimitRecoverEntry {
  return { ...state, attempts: state.attempts + 1 }
}
