import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import os from "os"
import path from "path"
import type { PluginInput } from "@mimo-ai/plugin"

const HOUR = 60 * 60 * 1000
const home = mkdtempSync(path.join(os.tmpdir(), "mimo-free-test-"))
process.env.MIMOCODE_HOME = home

const fakeInput = {
  client: {},
  project: {},
  worktree: "",
  directory: "",
  experimental_workspace: { register() {} },
  serverUrl: new URL("http://localhost:4096"),
  $: undefined,
} as unknown as PluginInput

afterAll(() => {
  delete process.env.MIMOCODE_HOME
  delete process.env.MIMOCODE_TOR
  delete process.env.MIMOCODE_RANDOM_UUID
  delete process.env.MIMOCODE_ENABLE_MIMO_FREE
  rmSync(home, { recursive: true, force: true })
})

async function free() {
  return await import("../../src/plugin/mimo-free")
}

describe("MimoFree.fingerprint", () => {
  test("rotates hourly while --tor is set", async () => {
    process.env.MIMOCODE_TOR = "1"
    delete process.env.MIMOCODE_RANDOM_UUID
    const { MimoFree } = await free()
    const realNow = Date.now
    try {
      let now = 277_778 * HOUR
      Date.now = () => now
      const a = MimoFree.fingerprint()
      const b = MimoFree.fingerprint()
      now += HOUR - 1
      const c = MimoFree.fingerprint()
      now += 2
      const d = MimoFree.fingerprint()
      expect(a).toBe(b)
      expect(a).toBe(c)
      expect(a).not.toBe(d)
    } finally {
      Date.now = realNow
    }
  })

  test("uses a fresh random id per process when --uuid is set", async () => {
    process.env.MIMOCODE_RANDOM_UUID = "1"
    delete process.env.MIMOCODE_TOR
    const { MimoFree } = await free()
    const a = MimoFree.fingerprint()
    const b = MimoFree.fingerprint()
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  test("stays stable without --tor across hour boundaries", async () => {
    delete process.env.MIMOCODE_TOR
    delete process.env.MIMOCODE_RANDOM_UUID
    const { MimoFree } = await free()
    const realNow = Date.now
    try {
      let now = 2_000_000_000_000
      Date.now = () => now
      const a = MimoFree.fingerprint()
      now += 3 * HOUR
      const b = MimoFree.fingerprint()
      expect(a).toBe(b)
    } finally {
      Date.now = realNow
    }
  })
})

describe("MimoFree.verify", () => {
  test("refuses to bootstrap without explicit opt-in and without network contact", async () => {
    delete process.env.MIMOCODE_ENABLE_MIMO_FREE
    const { MimoFree } = await free()
    await expect(MimoFree.verify()).rejects.toThrow("MIMOCODE_ENABLE_MIMO_FREE")
  })
})

describe("MimoFreeAuthPlugin", () => {
  test("does not register the mimo provider without explicit opt-in", async () => {
    delete process.env.MIMOCODE_ENABLE_MIMO_FREE
    const { MimoFreeAuthPlugin } = await free()
    const hooks = await MimoFreeAuthPlugin(fakeInput)
    expect(hooks.config).toBeUndefined()
  })

  test("registers the mimo provider when MIMOCODE_ENABLE_MIMO_FREE is set", async () => {
    process.env.MIMOCODE_ENABLE_MIMO_FREE = "1"
    const { MimoFreeAuthPlugin } = await free()
    const hooks = await MimoFreeAuthPlugin(fakeInput)
    expect(hooks.config).toBeDefined()
    const input: { provider?: Record<string, unknown> } = {}
    await hooks.config!(input as never)
    const mimo = input.provider?.mimo as { api?: string; models?: Record<string, unknown> }
    expect(mimo).toBeDefined()
    expect(mimo?.api).toContain("api.xiaomimimo.com")
    expect(mimo?.models).toHaveProperty("mimo-auto")
  })
})
