/** Max automatic promptAsync recoveries per rate-limit storm (then stop). */
export const RATE_LIMIT_AUTO_RETRY_MAX = 2

/** Ignore duplicate session.error signals within this window (same failure tick). */
export const SESSION_ERROR_BURST_MS = 3_000

/** Reset attempt counter after this much quiet time. */
export const RATE_LIMIT_STORM_RESET_MS = 5 * 60_000

/** First scheduled wait before auto-retry; doubles each attempt (15s → 30s → 60s). */
export const RATE_LIMIT_AUTO_RETRY_INITIAL_MS = 15_000

/** When a scheduled retry fires while the session is still busy, poll again after this. */
export const RATE_LIMIT_BUSY_DEFER_MS = 5_000
