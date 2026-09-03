import { afterEach, describe, expect, test } from "bun:test"
import { SessionID } from "../../src/session/schema"
import {
  RATE_LIMIT_AUTO_RETRY_MAX,
  SESSION_ERROR_BURST_MS,
  createRateLimitRecoveryCoordinator,
  gateSessionErrorPublish,
  resetSessionErrorBurstForTest,
} from "../../src/session/recovery"

/**
 * Replay of the 2026-08-31 fx session incident: duplicate session.error bursts
 * from one prompt_async failure caused uncapped parallel promptAsync calls.
 * This test proves the coordinator + server gate cap and suppress duplicates.
 */
describe("recovery replay — fx rate-limit storm", () => {
  const sessionID = SessionID.make("ses_replay_fx_storm")

  afterEach(() => {
    resetSessionErrorBurstForTest()
  })

  test("server suppresses duplicate session.error publishes in one burst", () => {
    const now = 1_700_000_000_000
    expect(gateSessionErrorPublish(sessionID, now)).toBe(true)
    expect(gateSessionErrorPublish(sessionID, now + 50)).toBe(false)
    expect(gateSessionErrorPublish(sessionID, now + 100)).toBe(false)
    expect(gateSessionErrorPublish(sessionID, now + SESSION_ERROR_BURST_MS)).toBe(true)
  })

  test("TUI schedules once per burst then stops after max retries", () => {
    const coord = createRateLimitRecoveryCoordinator()
    let now = 1_700_000_000_000

    const first = coord.onSessionError({ sessionID, now, source: "tui" })
    expect(first.action).toBe("schedule")
    if (first.action !== "schedule") return
    coord.setPendingTimer(sessionID, true)

    // Same-tick duplicates (observed 2–3 session.error per failure in fx logs).
    for (let i = 0; i < 2; i++) {
      now += 50
      expect(coord.onSessionError({ sessionID, now, source: "tui" }).action).toBe("noop")
    }

    now += SESSION_ERROR_BURST_MS + 1

    for (let attempt = 1; attempt < RATE_LIMIT_AUTO_RETRY_MAX; attempt++) {
      coord.setPendingTimer(sessionID, false)
      coord.markRetrySent(sessionID)
      const next = coord.onSessionError({ sessionID, now, source: "tui" })
      expect(next.action).toBe("schedule")
      if (next.action === "schedule") coord.setPendingTimer(sessionID, true)
      now += SESSION_ERROR_BURST_MS + 1
    }

    coord.setPendingTimer(sessionID, false)
    coord.markRetrySent(sessionID)
    const exhausted = coord.onSessionError({ sessionID, now, source: "tui" })
    expect(exhausted.action).toBe("stop_max")
  })

  test("skip_done stays distinct so TUI can toast instead of going silent", () => {
    const coord = createRateLimitRecoveryCoordinator()
    const skipped = coord.onSessionError({
      sessionID,
      now: 1_700_000_000_000,
      source: "tui",
      assistantDoneOrWaiting: true,
    })
    expect(skipped.action).toBe("skip_done")
  })

  test("idle clears coordinator state without canceling a pending timer", () => {
    const coord = createRateLimitRecoveryCoordinator()
    const now = 1_700_000_000_000
    const scheduled = coord.onSessionError({ sessionID, now, source: "tui" })
    expect(scheduled.action).toBe("schedule")
    coord.setPendingTimer(sessionID, true)
    coord.onIdle(sessionID)
    expect(coord.getState(sessionID)).toBeDefined()
    coord.setPendingTimer(sessionID, false)
    coord.onIdle(sessionID)
    expect(coord.getState(sessionID)).toBeUndefined()
  })
})
