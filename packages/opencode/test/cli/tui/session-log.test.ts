import { describe, test, expect } from "bun:test"
import path from "node:path"
import { tmpdir } from "../../fixture/fixture"
import { appendSessionLog, formatSessionLogEntry } from "../../../src/cli/cmd/tui/session-log"

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
