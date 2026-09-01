import { afterEach, describe, expect, test } from "bun:test"
import { SessionID } from "../../src/session/schema"
import {
  SESSION_ERROR_BURST_MS,
  gateSessionErrorPublish,
  resetSessionErrorBurstForTest,
  shouldPublishSessionError,
} from "../../src/session/recovery"

afterEach(() => {
  resetSessionErrorBurstForTest()
})

describe("shouldPublishSessionError", () => {
  const sessionID = SessionID.make("ses_test_burst")

  test("allows the first publish in a burst window", () => {
    expect(shouldPublishSessionError(sessionID, 1_000)).toBe(true)
  })

  test("suppresses duplicate publishes within the debounce window", () => {
    expect(shouldPublishSessionError(sessionID, 1_000)).toBe(true)
    expect(shouldPublishSessionError(sessionID, 1_000 + SESSION_ERROR_BURST_MS - 1)).toBe(false)
  })

  test("allows another publish after the debounce window", () => {
    expect(shouldPublishSessionError(sessionID, 1_000)).toBe(true)
    expect(shouldPublishSessionError(sessionID, 1_000 + SESSION_ERROR_BURST_MS)).toBe(true)
  })
})

describe("gateSessionErrorPublish", () => {
  const sessionID = SessionID.make("ses_test_gate")

  test("returns false when burst is active", () => {
    const now = 5_000
    expect(gateSessionErrorPublish(sessionID, now)).toBe(true)
    expect(gateSessionErrorPublish(sessionID, now + 1)).toBe(false)
  })
})
