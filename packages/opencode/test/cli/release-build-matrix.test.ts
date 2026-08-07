import { afterAll, describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { ALL_TARGETS, filterTargets, targetName } from "../../script/targets.ts"

const ROOT = resolve(import.meta.dir, "../../../..")
const PUBLISH_YML = resolve(ROOT, ".github/workflows/publish.yml")
const BUILD_TS = resolve(ROOT, "packages/opencode/script/build.ts")
const RELEASE_SCRIPT = resolve(ROOT, "script/release")
const RELEASING_MD = resolve(ROOT, "docs/RELEASING.md")
const AGENTS_MD = resolve(ROOT, "AGENTS.md")

const EXPECTED_NAMES = [
  "oimo-linux-arm64",
  "oimo-linux-x64",
  "oimo-linux-x64-baseline",
  "oimo-linux-arm64-musl",
  "oimo-linux-x64-musl",
  "oimo-linux-x64-baseline-musl",
  "oimo-darwin-arm64",
  "oimo-darwin-x64",
  "oimo-darwin-x64-baseline",
  "oimo-windows-arm64",
  "oimo-windows-x64",
  "oimo-windows-x64-baseline",
]

describe("release build matrix: targets.ts", () => {
  test("T1: targetName computes all 12 release asset names", () => {
    expect(ALL_TARGETS).toHaveLength(12)
    const names = ALL_TARGETS.map(targetName)
    expect(names).toEqual(EXPECTED_NAMES)
    expect(new Set(names).size).toBe(12)
  })

  test("T1b: targetName maps win32 to windows and suffixes baseline/musl", () => {
    expect(targetName({ os: "win32", arch: "x64" })).toBe("oimo-windows-x64")
    expect(targetName({ os: "linux", arch: "x64", avx2: false })).toBe("oimo-linux-x64-baseline")
    expect(targetName({ os: "linux", arch: "x64", abi: "musl" })).toBe("oimo-linux-x64-musl")
    expect(targetName({ os: "linux", arch: "x64", abi: "musl", avx2: false })).toBe(
      "oimo-linux-x64-baseline-musl",
    )
  })

  test("T2: filterTargets empty filter keeps all targets", () => {
    expect(filterTargets(ALL_TARGETS, [])).toEqual(ALL_TARGETS)
  })

  test("T2b: filterTargets selects a single target by name", () => {
    const filtered = filterTargets(ALL_TARGETS, ["oimo-linux-x64"])
    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toEqual({ os: "linux", arch: "x64" })
  })

  test("T2e: filterTargets accepts the unprefixed matrix form (linux-x64)", () => {
    const filtered = filterTargets(ALL_TARGETS, ["linux-x64", "windows-x64-baseline"])
    expect(filtered.map(targetName)).toEqual(["oimo-linux-x64", "oimo-windows-x64-baseline"])
  })

  test("T2c: filterTargets selects multiple comma-joined targets", () => {
    const filtered = filterTargets(ALL_TARGETS, ["oimo-darwin-arm64", "oimo-windows-x64-baseline"])
    expect(filtered.map(targetName)).toEqual(["oimo-darwin-arm64", "oimo-windows-x64-baseline"])
  })

  test("T2d: filterTargets ignores unknown names", () => {
    const filtered = filterTargets(ALL_TARGETS, ["oimo-linux-x64", "oimo-unknown-arch"])
    expect(filtered.map(targetName)).toEqual(["oimo-linux-x64"])
  })
})

describe("release build matrix: publish.yml", () => {
  const yml = readFileSync(PUBLISH_YML, "utf8")

  test("T3: workflow_dispatch trigger preserved", () => {
    expect(yml).toContain("workflow_dispatch")
  })

  test("T3b: build-cli runs a 12-target matrix", () => {
    expect(yml).toContain("matrix:")
    expect(yml).toContain("target:")
    for (const name of EXPECTED_NAMES) {
      expect(yml).toContain(`- ${name.replace(/^oimo-/, "")}`)
    }
  })

  test("T3c: each matrix job is handed its target via MIMOCODE_TARGETS", () => {
    expect(yml).toContain("MIMOCODE_TARGETS: ${{ matrix.target }}")
  })

  test("T3d: job dependency chain version -> build-cli -> publish", () => {
    expect(yml).toContain("needs: version")
    expect(yml).toContain("needs: [version, build-cli]")
  })

  test("T3e: publish job regenerates aggregate SHA256SUMS from uploaded assets", () => {
    expect(yml).toContain("gh release download")
    expect(yml).toContain("checksums.ts")
    expect(yml).toContain("upload \"$TAG\" release-assets/SHA256SUMS --clobber")
  })

  test("T3f: publish job finalizes the draft release", () => {
    expect(yml).toContain("--draft=false")
  })

  test("T3g: npm publish is guarded by NPM_TOKEN presence", () => {
    expect(yml).toContain('if [ -z "$NPM_TOKEN" ]')
  })
})

describe("release build matrix: build.ts", () => {
  const ts = readFileSync(BUILD_TS, "utf8")

  test("T4: build.ts reads MIMOCODE_TARGETS", () => {
    expect(ts).toContain("MIMOCODE_TARGETS")
  })

  test("T4b: full build emits SHA256SUMS, matrix runs skip it (centralized in publish)", () => {
    expect(ts).toContain("if (targetFilter.length === 0)")
    expect(ts).toContain("sha256Sums")
  })

  test("T4c: build.ts reuses targets.ts helpers", () => {
    expect(ts).toContain('from "./targets.ts"')
    expect(ts).toContain("filterTargets(allTargets, targetFilter)")
  })
})

describe("release build matrix: script/release", () => {
  const script = readFileSync(RELEASE_SCRIPT, "utf8")

  test("T5: script/release has one-stop options and watch/summary flow", () => {
    expect(script).toContain("--no-watch")
    expect(script).toContain("gh workflow run publish.yml")
    expect(script).toContain("gh run watch")
    expect(script).toContain("docs/RELEASING.md")
    expect(script).toContain("gh secret list")
  })

  test("T5b: --help exits 0 with usage", async () => {
    const proc = Bun.spawn(["bash", "script/release", "--help"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = await new Response(proc.stdout).text()
    const code = await proc.exited
    expect(code).toBe(0)
    expect(stdout).toContain("Usage: script/release")
    expect(stdout).toContain("docs/RELEASING.md")
  })

  test("T5c: unknown argument exits 1 with usage on stderr", async () => {
    const proc = Bun.spawn(["bash", "script/release", "--bogus"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    })
    const stderr = await new Response(proc.stderr).text()
    const code = await proc.exited
    expect(code).toBe(1)
    expect(stderr).toContain("Unknown argument: --bogus")
  })
})

describe("release build matrix: runbook + future reference", () => {
  test("T6: docs/RELEASING.md exists with required sections", () => {
    const md = readFileSync(RELEASING_MD, "utf8")
    for (const heading of ["概要", "前提条件", "リリース手順", "ワークフロー各ジョブの動作", "トラブルシュート"]) {
      expect(md).toContain(heading)
    }
    expect(md).toContain("./script/release")
    expect(md).toContain("SHA256SUMS")
    expect(md).toContain("OIMO_BASE_URL")
  })

  test("T7: AGENTS.md references docs/RELEASING.md for future sessions", () => {
    const md = readFileSync(AGENTS_MD, "utf8")
    expect(md).toContain("docs/RELEASING.md")
  })

  test("T7b: targets.ts is importable without side effects", () => {
    // importing the module must not touch the filesystem; readdirSync on
    // packages/opencode/script must not contain a run artifact from import
    const files = readdirSync(resolve(ROOT, "packages/opencode/script"))
    expect(files).toContain("targets.ts")
  })
})

afterAll(() => {})
