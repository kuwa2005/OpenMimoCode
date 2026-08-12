import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import os from "os"
import path from "path"

const ROOT = path.join(import.meta.dir, "..", "..")
const home = mkdtempSync(path.join(os.tmpdir(), "installation-id-test-"))
process.env.MIMOCODE_HOME = home

const persisted = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
writeFileSync(path.join(home, "installation_id"), persisted)

afterAll(() => {
  delete process.env.MIMOCODE_HOME
  delete process.env.MIMOCODE_RANDOM_UUID
  rmSync(home, { recursive: true, force: true })
})

async function readInstallationID() {
  const proc = Bun.spawn({
    cmd: [
      process.execPath,
      "--eval",
      `const { getInstallationID } = await import("./src/metrics/installation.ts")
console.log(await getInstallationID())`,
    ],
    cwd: ROOT,
    env: {
      ...process.env,
      MIMOCODE_HOME: home,
      MIMOCODE_RANDOM_UUID: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  expect(exitCode).toBe(0)
  return stdout.trim()
}

describe("metrics.installation", () => {
  test("MIMOCODE_RANDOM_UUID ignores persisted installation_id", async () => {
    const id = await readInstallationID()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(id).not.toBe(persisted)
  })

  test("MIMOCODE_RANDOM_UUID yields a new id on each process launch", async () => {
    const a = await readInstallationID()
    const b = await readInstallationID()
    expect(a).not.toBe(b)
  })
})
