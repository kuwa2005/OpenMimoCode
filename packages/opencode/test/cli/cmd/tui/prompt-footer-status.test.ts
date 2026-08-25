import { describe, test, expect } from "bun:test"
import {
  clampStatusMessage,
  STATUS_MESSAGE_MAX,
  shouldShowSessionActivity,
  shouldSpinInProgressTask,
} from "../../../../src/cli/cmd/tui/component/prompt/footer"

describe("clampStatusMessage", () => {
  test("an over-long status cannot outgrow the footer budget", () => {
    const long =
      "Context rebuilt from the latest checkpoint. Recent messages are preserved; earlier context is now summarized."
    expect(long.length).toBeGreaterThan(STATUS_MESSAGE_MAX)
    const out = clampStatusMessage(long)!
    expect(out.length).toBe(STATUS_MESSAGE_MAX)
    expect(out.endsWith("\u2026")).toBe(true)
    expect(long.startsWith(out.slice(0, -1))).toBe(true)
  })

  test("short statuses pass through untouched", () => {
    expect(clampStatusMessage("Rebuilding context\u2026")).toBe("Rebuilding context\u2026")
    expect(clampStatusMessage("Writing checkpoint\u2026")).toBe("Writing checkpoint\u2026")
  })

  test("newlines are flattened so the status can never claim extra rows", () => {
    expect(clampStatusMessage("Rebuilding\ncontext\u2026")).toBe("Rebuilding context\u2026")
    expect(clampStatusMessage("  Rebuilding   context\u2026  ")).toBe("Rebuilding context\u2026")
  })

  test("empty and missing statuses render nothing", () => {
    expect(clampStatusMessage(undefined)).toBeUndefined()
    expect(clampStatusMessage("")).toBeUndefined()
    expect(clampStatusMessage("   \n  ")).toBeUndefined()
  })

  test("the budget leaves room for the spinner, interrupt hint and context counter on 80 columns", () => {
    // "⠋ " + message + "esc interrupt" + "52.4K/960K (5%)"
    expect(STATUS_MESSAGE_MAX + 2 + "esc interrupt".length + "52.4K/960K (5%)".length).toBeLessThanOrEqual(80)
  })
})

describe("shouldShowSessionActivity", () => {
  test("busy session always shows activity", () => {
    expect(
      shouldShowSessionActivity({
        statusType: "busy",
        stopReason: "completed",
        hasInProgressTask: false,
        hasActiveActor: false,
        hasActiveChild: false,
      }),
    ).toBe(true)
  })

  test("idle between turns keeps spinner when tasks are in_progress", () => {
    expect(
      shouldShowSessionActivity({
        statusType: "idle",
        hasInProgressTask: true,
        hasActiveActor: false,
        hasActiveChild: false,
      }),
    ).toBe(true)
  })

  test("idle after goal stop ignores leftover in_progress tasks", () => {
    expect(
      shouldShowSessionActivity({
        statusType: "idle",
        stopReason: "completed",
        hasInProgressTask: true,
        hasActiveActor: false,
        hasActiveChild: false,
      }),
    ).toBe(false)
  })

  test("idle after goal stop still shows activity for running actors", () => {
    expect(
      shouldShowSessionActivity({
        statusType: "idle",
        stopReason: "completed",
        hasInProgressTask: true,
        hasActiveActor: true,
        hasActiveChild: false,
      }),
    ).toBe(true)
  })
})

describe("shouldSpinInProgressTask", () => {
  test("spins while the session is busy", () => {
    expect(shouldSpinInProgressTask({ sessionIdle: false, stopReason: "completed" })).toBe(true)
  })

  test("spins while idle without a stop reason (between turns)", () => {
    expect(shouldSpinInProgressTask({ sessionIdle: true })).toBe(true)
  })

  test("stops spinning once the goal has a stop reason", () => {
    expect(shouldSpinInProgressTask({ sessionIdle: true, stopReason: "completed" })).toBe(false)
  })
})
