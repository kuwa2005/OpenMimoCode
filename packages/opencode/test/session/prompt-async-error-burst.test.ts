import { afterEach, describe, expect, test } from "bun:test"
import { SessionID } from "../../src/session/schema"
import {
  PROMPT_ASYNC_ERROR_DEBOUNCE_MS,
  resetPromptAsyncErrorBurstForTest,
  shouldPublishPromptAsyncError,
} from "../../src/session/prompt-async-error-burst"

afterEach(() => {
  resetPromptAsyncErrorBurstForTest()
})

describe("shouldPublishPromptAsyncError", () => {
  const sessionID = SessionID.make("ses_test_burst")

  test("allows the first publish in a burst window", () => {
    expect(shouldPublishPromptAsyncError(sessionID, 1_000)).toBe(true)
  })

  test("suppresses duplicate publishes within the debounce window", () => {
    expect(shouldPublishPromptAsyncError(sessionID, 1_000)).toBe(true)
    expect(shouldPublishPromptAsyncError(sessionID, 1_000 + PROMPT_ASYNC_ERROR_DEBOUNCE_MS - 1)).toBe(false)
  })

  test("allows another publish after the debounce window", () => {
    expect(shouldPublishPromptAsyncError(sessionID, 1_000)).toBe(true)
    expect(shouldPublishPromptAsyncError(sessionID, 1_000 + PROMPT_ASYNC_ERROR_DEBOUNCE_MS)).toBe(true)
  })
})
