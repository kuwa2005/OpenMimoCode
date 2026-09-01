/** Max automatic promptAsync recoveries per rate-limit storm (then stop). */
export const RATE_LIMIT_AUTO_RETRY_MAX = 3

/** Ignore duplicate session.error bursts within this window (same failure tick). */
export const RATE_LIMIT_ERROR_BURST_MS = 3_000

/** Reset attempt counter after this much quiet time. */
export const RATE_LIMIT_STORM_RESET_MS = 5 * 60_000

/** First scheduled wait before auto-retry; doubles each attempt (15s → 30s → 60s). */
export const RATE_LIMIT_AUTO_RETRY_INITIAL_MS = 15_000

/** When a scheduled retry fires while the session is still busy, poll again after this. */
export const RATE_LIMIT_BUSY_DEFER_MS = 5_000

export type RateLimitRecoverEntry = {
  attempts: number
  stormStartedAt: number
  lastBurstAt: number
}

export type RateLimitRecoverPlan =
  | { action: "ignore_burst" }
  | { action: "ignore_pending" }
  | { action: "stop_max" }
  | { action: "schedule"; delayMs: number; attempt: number }

export function rateLimitRetryDelayMs(attempt: number) {
  return RATE_LIMIT_AUTO_RETRY_INITIAL_MS * Math.pow(2, attempt)
}

export function planRateLimitRecover(input: {
  state: RateLimitRecoverEntry | undefined
  now: number
  hasPendingTimer: boolean
}): RateLimitRecoverPlan {
  if (input.state && input.now - input.state.lastBurstAt < RATE_LIMIT_ERROR_BURST_MS) {
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
