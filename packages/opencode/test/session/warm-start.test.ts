import { describe, expect, test } from "bun:test"
import {
  WARM_START_MARKER,
  consumeBrief,
  findContextWatermark,
  formatBrief,
  lastAssistantSnippet,
  readSessionLogTail,
  registerBrief,
} from "../../src/session/warm-start"
import { MessageID, SessionID } from "../../src/session/schema"
import type { MessageV2 } from "../../src/session/message-v2"

const sessionID = SessionID.make("ses_warm_test")

describe("session.warm-start", () => {
  test("formatBrief without source explains fresh start", () => {
    const brief = formatBrief({ mode: "summary", directory: "/tmp/project" })
    expect(brief).toContain(WARM_START_MARKER)
    expect(brief).toContain("No prior root session")
  })

  test("formatBrief includes todos, assistant snippet, and deep note", () => {
    const brief = formatBrief({
      mode: "deep",
      directory: "/tmp/project",
      bundle: {
        source: {
          id: sessionID,
          title: "tab-audio-recorder",
          time: { updated: Date.now() - 3_600_000, created: 0 },
          summary: { files: 3, additions: 10, deletions: 2 },
        },
        todos: [{ content: "Fix actor args", status: "in_progress" }],
        lastAssistantText: "Tests passed.",
        sessionLogTail: "All green.",
        watermark: MessageID.make("msg_watermark"),
      },
    })
    expect(brief).toContain('Source session: "tab-audio-recorder"')
    expect(brief).toContain("[in_progress] Fix actor args")
    expect(brief).toContain("Last assistant message: Tests passed.")
    expect(brief).toContain("Last logged result: All green.")
    expect(brief).toContain("Deep warm: compacted parent context")
  })

  test("findContextWatermark picks last compaction boundary", () => {
    const watermark = MessageID.make("msg_compact")
    const msgs = [
      {
        info: { id: MessageID.make("msg_user"), role: "user" as const },
        parts: [{ type: "compaction" as const }],
      },
      {
        info: { id: watermark, role: "user" as const },
        parts: [{ type: "compaction" as const, auto: true, overflow: false }],
      },
    ] as MessageV2.WithParts[]
    expect(findContextWatermark(msgs)).toBe(watermark)
  })

  test("lastAssistantSnippet skips synthetic text", () => {
    const msgs = [
      {
        info: { id: MessageID.make("msg_a"), role: "assistant" as const },
        parts: [
          { type: "text" as const, text: "visible result", synthetic: false, ignored: false },
          { type: "text" as const, text: "hidden", synthetic: true, ignored: false },
        ],
      },
    ] as MessageV2.WithParts[]
    expect(lastAssistantSnippet(msgs)).toBe("visible result")
  })

  test("registerBrief is consumed once", () => {
    registerBrief(sessionID, "brief")
    expect(consumeBrief(sessionID)).toBe("brief")
    expect(consumeBrief(sessionID)).toBeUndefined()
  })

  test("readSessionLogTail returns last Result section", () => {
    const dir = `/tmp/oimo-warm-${Date.now()}`
    const logDir = `${dir}/.oimo`
    Bun.spawnSync(["mkdir", "-p", logDir])
    const file = `${logDir}/oimo-session-test.md`
    Bun.write(
      file,
      ["## old", "### Result", "first", "---", "## new", "### Result", "latest outcome", "---", ""].join("\n"),
    )
    expect(readSessionLogTail(dir)).toBe("latest outcome")
    Bun.spawnSync(["rm", "-rf", dir])
  })
})
