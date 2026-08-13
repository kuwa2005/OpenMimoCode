import { afterEach, describe, expect, test } from "bun:test"
import {
  OIMO_USER_AGENT,
  ZEN_USER_AGENT,
  oimoUserAgent,
  providerRequestHeaders,
  zenUserAgent,
} from "../../src/session/provider-headers"

const ORIGINAL_CLIENT = process.env.MIMOCODE_CLIENT

describe("providerRequestHeaders", () => {
  afterEach(() => {
    if (ORIGINAL_CLIENT === undefined) delete process.env.MIMOCODE_CLIENT
    else process.env.MIMOCODE_CLIENT = ORIGINAL_CLIENT
  })

  test("Zen / big-pickle: official-compatible identity headers", () => {
    delete process.env.MIMOCODE_CLIENT
    const headers = providerRequestHeaders({
      providerID: "opencode",
      sessionID: "ses_abc",
      requestID: "msg_123",
      projectID: "prj_xyz",
      parentSessionID: "ses_parent",
    })

    expect(headers["User-Agent"]).toBe(zenUserAgent())
    expect(headers["User-Agent"]).toBe(ZEN_USER_AGENT)
    expect(headers["User-Agent"].startsWith("opencode/")).toBe(true)
    expect(headers["x-opencode-client"]).toBe("cli")
    expect(headers["x-opencode-session"]).toBe("ses_abc")
    expect(headers["x-opencode-request"]).toBe("msg_123")
    expect(headers["x-opencode-project"]).toBe("prj_xyz")
    expect(headers["x-session-affinity"]).toBeUndefined()
    expect(headers["x-parent-session-id"]).toBeUndefined()
  })

  test("Zen: x-opencode-client follows MIMOCODE_CLIENT (default cli)", () => {
    process.env.MIMOCODE_CLIENT = "desktop"
    const headers = providerRequestHeaders({
      providerID: "opencode",
      sessionID: "ses_1",
    })
    expect(headers["x-opencode-client"]).toBe("desktop")
  })

  test("Zen: explicit client arg wins over env", () => {
    process.env.MIMOCODE_CLIENT = "desktop"
    const headers = providerRequestHeaders({
      providerID: "opencode",
      client: "acp",
      sessionID: "ses_1",
    })
    expect(headers["x-opencode-client"]).toBe("acp")
  })

  test("Zen: providerID prefix match (opencode-go)", () => {
    delete process.env.MIMOCODE_CLIENT
    const headers = providerRequestHeaders({
      providerID: "opencode-go",
      sessionID: "ses_1",
      requestID: "msg_1",
    })
    expect(headers["User-Agent"]).toBe(ZEN_USER_AGENT)
    expect(headers["x-opencode-session"]).toBe("ses_1")
    expect(headers["x-opencode-client"]).toBe("cli")
  })

  test("Zen: identity headers win over extra User-Agent", () => {
    const headers = providerRequestHeaders({
      providerID: "opencode",
      sessionID: "ses_1",
      extra: { "User-Agent": "oimo/spoof", "x-custom": "keep" },
    })
    expect(headers["User-Agent"]).toBe(ZEN_USER_AGENT)
    expect(headers["x-custom"]).toBe("keep")
  })

  test("non-Zen: oimo UA + session affinity only", () => {
    const headers = providerRequestHeaders({
      providerID: "anthropic",
      sessionID: "ses_abc",
      requestID: "msg_123",
      parentSessionID: "ses_parent",
      extra: { Authorization: "Bearer x" },
    })

    expect(headers["User-Agent"]).toBe(oimoUserAgent())
    expect(headers["User-Agent"]).toBe(OIMO_USER_AGENT)
    expect(headers["User-Agent"].startsWith("oimo/")).toBe(true)
    expect(headers["x-session-affinity"]).toBe("ses_abc")
    expect(headers["x-parent-session-id"]).toBe("ses_parent")
    expect(headers["Authorization"]).toBe("Bearer x")
    expect(headers["x-opencode-client"]).toBeUndefined()
    expect(headers["x-opencode-session"]).toBeUndefined()
  })

  test("omits empty optional fields", () => {
    delete process.env.MIMOCODE_CLIENT
    const zen = providerRequestHeaders({ providerID: "opencode" })
    expect(zen["x-opencode-session"]).toBeUndefined()
    expect(zen["x-opencode-request"]).toBeUndefined()
    expect(zen["x-opencode-project"]).toBeUndefined()
    expect(zen["x-opencode-client"]).toBe("cli")
    expect(zen["User-Agent"]).toBe(ZEN_USER_AGENT)

    const other = providerRequestHeaders({ providerID: "openai" })
    expect(other["x-session-affinity"]).toBeUndefined()
    expect(other["x-parent-session-id"]).toBeUndefined()
    expect(other["User-Agent"]).toBe(OIMO_USER_AGENT)
  })
})
