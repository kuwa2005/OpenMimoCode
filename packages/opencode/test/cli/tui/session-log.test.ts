import { describe, test, expect } from "bun:test"
import path from "node:path"
import { tmpdir } from "../../fixture/fixture"
import {
  appendSessionLog,
  flushSessionLogResult,
  formatSessionLogEntry,
  formatSessionLogQA,
  formatSessionLogResult,
  formatSessionLogUser,
  generateSessionLogFileName,
  recordSessionLogAssistant,
  recordSessionLogQA,
  recordSessionLogUser,
  resolveSessionLogFile,
  sessionLogMode,
} from "../../../src/cli/cmd/tui/session-log"

describe("session-log", () => {
  test("formats a markdown entry", () => {
    const out = formatSessionLogEntry("question", "answer", 0)
    expect(out).toContain("## 1970-01-01T00:00:00.000Z")
    expect(out).toContain("### User\n\nquestion")
    expect(out).toContain("### oimo\n\nanswer")
    expect(out).toContain("---")
  })

  test("appends every completed turn to the --log file", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "log.md")
    process.env.MIMOCODE_LOG = file
    try {
      await appendSessionLog({ question: "q1", answer: "a1", time: 1000 })
      await appendSessionLog({ question: "q2", answer: "a2", time: 2000 })
    } finally {
      delete process.env.MIMOCODE_LOG
    }
    const content = await Bun.file(file).text()
    expect(content.match(/^## /gm)).toHaveLength(2)
    expect(content).toContain("q1")
    expect(content).toContain("a2")
  })
})

describe("session-log summary mode", () => {
  test("sessionLogMode reads MIMOCODE_LOG_MODE", () => {
    delete process.env.MIMOCODE_LOG_MODE
    expect(sessionLogMode()).toBe("summary")
    process.env.MIMOCODE_LOG_MODE = "full"
    expect(sessionLogMode()).toBe("full")
    process.env.MIMOCODE_LOG_MODE = "summary"
    expect(sessionLogMode()).toBe("summary")
    delete process.env.MIMOCODE_LOG_MODE
  })

  test("formats a user input entry", () => {
    const out = formatSessionLogUser("hello", 0)
    expect(out).toContain("## 1970-01-01T00:00:00.000Z")
    expect(out).toContain("### User\n\nhello")
    expect(out).toContain("---")
  })

  test("formats a result entry", () => {
    const out = formatSessionLogResult("done", 0)
    expect(out).toContain("### Result\n\ndone")
    expect(out).toContain("---")
  })

  test("formats a question/answer entry", () => {
    const out = formatSessionLogQA({
      questions: [
        { question: "Which mode?", options: [{ label: "full" }, { label: "summary" }] },
        { question: "Free text?" },
      ],
      answers: [["summary"], []],
      time: 0,
    })
    expect(out).toContain("### Question")
    expect(out).toContain("1. Which mode?\nOptions: full / summary")
    expect(out).toContain("2. Free text?")
    expect(out).toContain("### Answer")
    expect(out).toContain("1. summary")
    expect(out).toContain("2. (no answer)")
  })

  test("generates a timestamped auto-name and dedupes", async () => {
    await using tmp = await tmpdir()
    const first = await generateSessionLogFileName(tmp.path, new Date("2026-08-06T12:34:56"))
    expect(first).toBe(path.join(tmp.path, "oimo-session-20260806-123456.md"))
    await Bun.write(first, "")
    const second = await generateSessionLogFileName(tmp.path, new Date("2026-08-06T12:34:56"))
    expect(second).toBe(path.join(tmp.path, "oimo-session-20260806-123456-1.md"))
  })

  test("resolves the session log target", async () => {
    expect(await resolveSessionLogFile({ explicit: undefined, auto: false, cwd: "/tmp" })).toBeUndefined()
    await using tmp = await tmpdir()
    const auto = await resolveSessionLogFile({
      explicit: undefined,
      auto: true,
      cwd: tmp.path,
      now: new Date("2026-08-06T12:34:56"),
    })
    expect(auto).toBe(path.join(tmp.path, "oimo-session-20260806-123456.md"))
    expect(await resolveSessionLogFile({ explicit: "/abs/path.md", auto: false, cwd: tmp.path })).toBe("/abs/path.md")
  })

  test("buffers the assistant result and flushes it on the next user input", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "log.md")
    process.env.MIMOCODE_LOG = file
    process.env.MIMOCODE_LOG_MODE = "summary"
    try {
      await recordSessionLogUser("q1", 1000)
      await recordSessionLogAssistant("intermediate", 2000)
      await recordSessionLogAssistant("", 2500)
      await recordSessionLogAssistant("final answer", 3000)
      let content = await Bun.file(file).text()
      expect(content).not.toContain("intermediate")
      expect(content).not.toContain("final answer")

      await recordSessionLogUser("q2", 4000)
      content = await Bun.file(file).text()
      expect(content).toContain("### User\n\nq1")
      expect(content).toContain("### Result\n\nfinal answer")
      expect(content).toContain("### User\n\nq2")
      expect(content).not.toContain("intermediate")
      expect(content.indexOf("### Result\n\nfinal answer")).toBeLessThan(content.indexOf("### User\n\nq2"))

      await recordSessionLogAssistant("last", 5000)
      await flushSessionLogResult()
      content = await Bun.file(file).text()
      expect(content).toContain("### Result\n\nlast")
    } finally {
      delete process.env.MIMOCODE_LOG
      delete process.env.MIMOCODE_LOG_MODE
      delete process.env.MIMOCODE_LOG_AUTO
    }
  })

  test("flushSessionLogResult writes nothing without a pending result", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "log.md")
    process.env.MIMOCODE_LOG = file
    process.env.MIMOCODE_LOG_MODE = "summary"
    try {
      await flushSessionLogResult()
      expect(await Bun.file(file).exists()).toBe(false)
    } finally {
      delete process.env.MIMOCODE_LOG
      delete process.env.MIMOCODE_LOG_MODE
    }
  })

  test("appends a question/answer entry on reply", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "log.md")
    process.env.MIMOCODE_LOG = file
    process.env.MIMOCODE_LOG_MODE = "summary"
    try {
      await recordSessionLogQA({
        questions: [{ question: "Q?", options: [{ label: "A" }, { label: "B" }] }],
        answers: [["A"]],
        time: 0,
      })
      const content = await Bun.file(file).text()
      expect(content).toContain("### Question")
      expect(content).toContain("Options: A / B")
      expect(content).toContain("### Answer")
      expect(content).toContain("1. A")
    } finally {
      delete process.env.MIMOCODE_LOG
      delete process.env.MIMOCODE_LOG_MODE
    }
  })

  test("full mode ignores summary-only records", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "log.md")
    process.env.MIMOCODE_LOG = file
    process.env.MIMOCODE_LOG_MODE = "full"
    try {
      await recordSessionLogAssistant("x", 0)
      await recordSessionLogUser("y", 0)
      await recordSessionLogQA({ questions: [{ question: "q" }], answers: [["a"]], time: 0 })
      await flushSessionLogResult()
      expect(await Bun.file(file).exists()).toBe(false)
    } finally {
      delete process.env.MIMOCODE_LOG
      delete process.env.MIMOCODE_LOG_MODE
    }
  })

  test("summary is the default mode", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "log.md")
    process.env.MIMOCODE_LOG = file
    delete process.env.MIMOCODE_LOG_MODE
    try {
      expect(sessionLogMode()).toBe("summary")
      await recordSessionLogUser("hello", 0)
      const content = await Bun.file(file).text()
      expect(content).toContain("### User\n\nhello")
    } finally {
      delete process.env.MIMOCODE_LOG
    }
  })
})
