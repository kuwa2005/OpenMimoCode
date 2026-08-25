import { describe, expect, test, beforeEach } from "bun:test"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import * as Evidence from "../../src/reliability/evidence"
import * as Existence from "../../src/reliability/existence"
import * as Scope from "../../src/reliability/scope"
import * as ConfigReliability from "../../src/config/reliability"

function msgs(parts: MessageV2.ToolPart[]): MessageV2.WithParts[] {
  return [
    {
      info: {
        id: MessageID.ascending(),
        sessionID: SessionID.descending(),
        role: "assistant",
        time: { created: 1 },
        agent: "build",
        mode: "build",
        modelID: "test",
        providerID: "test",
        parentID: MessageID.ascending(),
        path: { cwd: "/tmp", root: "/tmp" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts,
    } as unknown as MessageV2.WithParts,
  ]
}

function tool(input: {
  tool: string
  args: Record<string, unknown>
  status?: "completed" | "error"
  metadata?: Record<string, unknown>
  output?: string
  end?: number
}) {
  const status = input.status ?? "completed"
  return MessageV2.ToolPart.parse({
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID: SessionID.descending(),
    type: "tool",
    tool: input.tool,
    callID: crypto.randomUUID(),
    state:
      status === "completed"
        ? {
            status,
            input: input.args,
            output: input.output ?? "ok",
            title: input.tool,
            metadata: input.metadata ?? {},
            time: { start: 1, end: input.end ?? 2 },
          }
        : {
            status,
            input: input.args,
            error: "failed",
            metadata: input.metadata,
            time: { start: 1, end: input.end ?? 2 },
          },
  })
}

describe("Evidence freshness", () => {
  test("fresh when no edits", () => {
    const report = Evidence.evaluate(
      msgs([tool({ tool: "bash", args: { command: "ls" }, metadata: { exit: 0 } })]),
    )
    expect(report.fresh).toBe(true)
    expect(report.edited).toBe(false)
  })

  test("stale after edit without verify", () => {
    const report = Evidence.evaluate(
      msgs([
        tool({
          tool: "edit",
          args: { file_path: "a.ts" },
          metadata: { diff: "-a\n+b" },
          end: 10,
        }),
      ]),
    )
    expect(report.fresh).toBe(false)
    expect(report.edited).toBe(true)
  })

  test("fresh when verify succeeds after edit", () => {
    const report = Evidence.evaluate(
      msgs([
        tool({
          tool: "write",
          args: { file_path: "a.ts", content: "x" },
          metadata: { diff: "+x" },
          end: 10,
        }),
        tool({
          tool: "bash",
          args: { command: "bun test" },
          metadata: { exit: 0 },
          end: 20,
        }),
      ]),
    )
    expect(report.fresh).toBe(true)
    expect(report.verifyCommand).toBe("bun test")
  })

  test("stale when verify precedes last edit", () => {
    const report = Evidence.evaluate(
      msgs([
        tool({
          tool: "bash",
          args: { command: "bun test" },
          metadata: { exit: 0 },
          end: 5,
        }),
        tool({
          tool: "edit",
          args: { file_path: "a.ts" },
          metadata: { diff: "-a\n+b" },
          end: 10,
        }),
      ]),
    )
    expect(report.fresh).toBe(false)
  })

  test("stale when verify exits non-zero", () => {
    const report = Evidence.evaluate(
      msgs([
        tool({
          tool: "edit",
          args: { file_path: "a.ts" },
          metadata: { diff: "-a\n+b" },
          end: 10,
        }),
        tool({
          tool: "bash",
          args: { command: "bun test" },
          metadata: { exit: 1 },
          end: 20,
        }),
      ]),
    )
    expect(report.fresh).toBe(false)
  })
})

describe("Existence claims", () => {
  test("flags missing package scripts", () => {
    const findings = Existence.checkCommand("npm run test:auth && bun run ghost", {
      cwd: "/tmp",
      scripts: new Set(["test"]),
      exists: () => true,
    })
    expect(findings.map((f) => f.claim).sort()).toEqual(["ghost", "test:auth"])
  })

  test("allows existing scripts and bun test builtin", () => {
    const findings = Existence.checkCommand("bun test && npm run test", {
      cwd: "/tmp",
      scripts: new Set(["test"]),
      exists: () => true,
    })
    expect(findings).toEqual([])
  })

  test("flags missing local source paths", () => {
    const findings = Existence.checkCommand("cat ./src/missing.ts", {
      cwd: "/repo",
      scripts: new Set(),
      exists: (absolute) => absolute !== "/repo/src/missing.ts",
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.kind).toBe("missing_path")
  })
})

describe("Edit scope", () => {
  beforeEach(() => {
    Scope.resetAll()
  })

  test("denies default protected .env", () => {
    const message = Scope.checkWrite("/repo/.env", {
      sessionID: "s1",
      worktree: "/repo",
      cfg: {},
    })
    expect(message).toContain(".env")
  })

  test("enforces allowlist when set", () => {
    Scope.set("s1", { allow: ["src/**"], deny: [] })
    expect(
      Scope.checkWrite("/repo/src/a.ts", {
        sessionID: "s1",
        worktree: "/repo",
        cfg: {},
      }),
    ).toBeUndefined()
    expect(
      Scope.checkWrite("/repo/README.md", {
        sessionID: "s1",
        worktree: "/repo",
        cfg: {},
      }),
    ).toContain("outside allow_globs")
  })

  test("respects reliability.scope opt-out", () => {
    const message = Scope.checkWrite("/repo/.env", {
      sessionID: "s1",
      worktree: "/repo",
      cfg: { reliability: { scope: false } },
    })
    expect(message).toBeUndefined()
  })
})

describe("ConfigReliability", () => {
  test("features default on when harness enabled", () => {
    expect(ConfigReliability.enabled({})).toBe(true)
    expect(ConfigReliability.feature({}, "evidence")).toBe(true)
    expect(ConfigReliability.feature({ reliability: { evidence: false } }, "evidence")).toBe(false)
    expect(ConfigReliability.feature({ reliability: { enabled: false } }, "loop")).toBe(false)
  })
})
