import { describe, test, expect } from "bun:test"
import {
  clampStatusMessage,
  STATUS_MESSAGE_MAX,
  shouldShowSessionActivity,
  shouldSpinInProgressTask,
  isInfraChildSession,
  isSessionMainActor,
  isConcurrentActiveActor,
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
        hasActiveActor: false,
        hasActiveChild: false,
      }),
    ).toBe(true)
  })

  test("idle with no concurrent work hides activity even if board rows look stale", () => {
    expect(
      shouldShowSessionActivity({
        statusType: "idle",
        hasActiveActor: false,
        hasActiveChild: false,
      }),
    ).toBe(false)
  })

  test("idle still shows activity for concurrent spawned actors", () => {
    expect(
      shouldShowSessionActivity({
        statusType: "idle",
        hasActiveActor: true,
        hasActiveChild: false,
      }),
    ).toBe(true)
  })

  test("idle hides activity when the only pending actor is leftover main", () => {
    const actors = [
      { actor_id: "main", mode: "main", status: "pending" },
    ]
    expect(
      shouldShowSessionActivity({
        statusType: "idle",
        hasActiveActor: actors.some(isConcurrentActiveActor),
        hasActiveChild: false,
      }),
    ).toBe(false)
  })

  test("idle still shows activity when a spawned actor is pending beside leftover main", () => {
    const actors = [
      { actor_id: "main", mode: "main", status: "pending" },
      { actor_id: "explore-1", mode: "subagent", status: "pending" },
    ]
    expect(
      shouldShowSessionActivity({
        statusType: "idle",
        hasActiveActor: actors.some(isConcurrentActiveActor),
        hasActiveChild: false,
      }),
    ).toBe(true)
  })

  test("idle still shows activity for busy child sessions", () => {
    expect(
      shouldShowSessionActivity({
        statusType: "idle",
        hasActiveActor: false,
        hasActiveChild: true,
      }),
    ).toBe(true)
  })
})

describe("isConcurrentActiveActor", () => {
  test("does not treat the session main row as concurrent work", () => {
    expect(isSessionMainActor({ actor_id: "main", mode: "main" })).toBe(true)
    expect(isSessionMainActor({ actor_id: "main" })).toBe(true)
    expect(isSessionMainActor({ mode: "main", actor_id: "compose-1" })).toBe(true)
    expect(isConcurrentActiveActor({ actor_id: "main", mode: "main", status: "pending" })).toBe(false)
    expect(isConcurrentActiveActor({ actor_id: "main", mode: "main", status: "running" })).toBe(false)
  })

  test("treats pending or running spawned actors as concurrent work", () => {
    expect(isConcurrentActiveActor({ actor_id: "explore-1", mode: "subagent", status: "pending" })).toBe(true)
    expect(isConcurrentActiveActor({ actor_id: "explore-1", mode: "subagent", status: "running" })).toBe(true)
    expect(isConcurrentActiveActor({ actor_id: "ses_child", mode: "peer", status: "pending" })).toBe(true)
    expect(isConcurrentActiveActor({ actor_id: "explore-1", mode: "subagent", status: "completed" })).toBe(false)
  })
})

describe("isInfraChildSession", () => {
  test("treats checkpoint-writer children as infra", () => {
    expect(isInfraChildSession({ title: "checkpoint-writer: Previous checkpoint: …" })).toBe(true)
  })

  test("does not treat ordinary child titles as infra", () => {
    expect(isInfraChildSession({ title: "Explore auth module" })).toBe(false)
  })
})

describe("shouldSpinInProgressTask", () => {
  test("spins while the session is busy", () => {
    expect(shouldSpinInProgressTask({ sessionIdle: false })).toBe(true)
  })

  test("stops spinning once the session is idle", () => {
    expect(shouldSpinInProgressTask({ sessionIdle: true })).toBe(false)
  })
})
