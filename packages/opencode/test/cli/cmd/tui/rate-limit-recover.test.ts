import { describe, test, expect } from "bun:test"
import {
  RATE_LIMIT_AUTO_RETRY_MAX,
  RATE_LIMIT_STORM_RESET_MS,
  SESSION_ERROR_BURST_MS,
  afterRateLimitRetrySent,
  nextRateLimitRecoverState,
  planRateLimitRecover,
  rateLimitRetryDelayMs,
} from "../../../../src/session/recovery"

describe("rateLimitRetryDelayMs", () => {
  test("uses exponential backoff from 15s", () => {
    expect(rateLimitRetryDelayMs(0)).toBe(15_000)
    expect(rateLimitRetryDelayMs(1)).toBe(30_000)
    expect(rateLimitRetryDelayMs(2)).toBe(60_000)
  })
})

describe("planRateLimitRecover", () => {
  test("ignores duplicate errors in the same burst", () => {
    const now = 1_000_000
    const state = { attempts: 0, stormStartedAt: now, lastBurstAt: now }
    expect(
      planRateLimitRecover({
        state,
        now: now + SESSION_ERROR_BURST_MS - 1,
        hasPendingTimer: false,
      }),
    ).toEqual({ action: "ignore_burst" })
  })

  test("does not stack timers when one is already pending", () => {
    expect(
      planRateLimitRecover({
        state: undefined,
        now: 0,
        hasPendingTimer: true,
      }),
    ).toEqual({ action: "ignore_pending" })
  })

  test("stops after max automatic retries in one storm", () => {
    const now = 5_000
    const state = { attempts: RATE_LIMIT_AUTO_RETRY_MAX, stormStartedAt: now, lastBurstAt: now - 10_000 }
    expect(
      planRateLimitRecover({
        state,
        now: now + SESSION_ERROR_BURST_MS + 1,
        hasPendingTimer: false,
      }),
    ).toEqual({ action: "stop_max" })
  })

  test("resets attempt budget after storm quiet period", () => {
    const now = 1_000_000
    const state = {
      attempts: RATE_LIMIT_AUTO_RETRY_MAX,
      stormStartedAt: now - RATE_LIMIT_STORM_RESET_MS - 1,
      lastBurstAt: now - RATE_LIMIT_STORM_RESET_MS - 1,
    }
    expect(
      planRateLimitRecover({
        state,
        now,
        hasPendingTimer: false,
      }),
    ).toEqual({ action: "schedule", delayMs: 15_000, attempt: 1 })
  })

  test("schedules first retry with backoff when idle", () => {
    expect(
      planRateLimitRecover({
        state: undefined,
        now: 0,
        hasPendingTimer: false,
      }),
    ).toEqual({ action: "schedule", delayMs: 15_000, attempt: 1 })
  })

  test("skips auto-recover when assistant already done or waiting", () => {
    expect(
      planRateLimitRecover({
        state: undefined,
        now: 0,
        hasPendingTimer: false,
        assistantDoneOrWaiting: true,
      }),
    ).toEqual({ action: "skip_done" })
  })
})

describe("nextRateLimitRecoverState / afterRateLimitRetrySent", () => {
  test("records burst time without incrementing until retry fires", () => {
    const next = nextRateLimitRecoverState(undefined, 100)
    expect(next).toEqual({ attempts: 0, stormStartedAt: 100, lastBurstAt: 100 })
    expect(afterRateLimitRetrySent(next)).toEqual({ attempts: 1, stormStartedAt: 100, lastBurstAt: 100 })
  })
})

describe("rate limit recover storm simulation", () => {
  test("caps automatic retries and resets budget after quiet period", () => {
    let now = 1_000_000
    let state = undefined as ReturnType<typeof nextRateLimitRecoverState> | undefined
    let pendingTimer = false

    const plan = () =>
      planRateLimitRecover({
        state,
        now,
        hasPendingTimer: pendingTimer,
      })

    expect(plan()).toEqual({ action: "schedule", delayMs: 15_000, attempt: 1 })
    state = nextRateLimitRecoverState(state, now)
    pendingTimer = true
    now += 100
    expect(plan()).toEqual({ action: "ignore_burst" })
    now += SESSION_ERROR_BURST_MS

    for (let attempt = 1; attempt <= RATE_LIMIT_AUTO_RETRY_MAX; attempt++) {
      pendingTimer = false
      expect(plan()).toEqual({
        action: "schedule",
        delayMs: rateLimitRetryDelayMs(attempt - 1),
        attempt,
      })
      state = nextRateLimitRecoverState(state, now)
      pendingTimer = true
      state = afterRateLimitRetrySent(state)
      now += SESSION_ERROR_BURST_MS + 1
    }

    pendingTimer = false
    expect(plan()).toEqual({ action: "stop_max" })

    now += RATE_LIMIT_STORM_RESET_MS + 1
    expect(plan()).toEqual({ action: "schedule", delayMs: 15_000, attempt: 1 })
  })
})
