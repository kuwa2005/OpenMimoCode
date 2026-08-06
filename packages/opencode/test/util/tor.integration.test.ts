import { describe, expect, test } from "bun:test"
import { initTor } from "../../src/util/tor"

const PROXY_ENV_KEYS = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"] as const

describe("util.tor integration (real Tor)", () => {
  const enabled = process.env.MIMOCODE_TOR_REAL === "1"

  if (!enabled) {
    test("integration tests require MIMOCODE_TOR_REAL=1 and a running Tor daemon", () => {})
    return
  }

  test("routes HTTPS traffic through a running Tor daemon", async () => {
    process.env.MIMOCODE_TOR = "1"
    delete process.env.MIMOCODE_TOR_PROXY
    const cleanup = await initTor()

    const check = (await (
      await fetch("https://check.torproject.org/api/ip", { signal: AbortSignal.timeout(30_000) })
    ).json()) as { IsTor: boolean; IP?: string }

    expect(check.IsTor).toBe(true)
    expect(typeof check.IP).toBe("string")
    cleanup?.()
  })

  test("egress IP changes between direct and Tor", async () => {
    const direct = await (await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(15_000) })).text()

    process.env.MIMOCODE_TOR = "1"
    delete process.env.MIMOCODE_TOR_PROXY
    const cleanup = await initTor()
    const viaTor = await (await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(30_000) })).text()

    expect(viaTor.length).toBeGreaterThan(0)
    expect(viaTor).not.toBe(direct)
    cleanup?.()
    for (const key of PROXY_ENV_KEYS) delete process.env[key]
    delete process.env.MIMOCODE_TOR
  })
})
