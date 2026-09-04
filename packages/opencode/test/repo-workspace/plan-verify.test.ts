import { afterEach, describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import * as RepoWorkspace from "../../src/repo-workspace"

const dirs: string[] = []

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oimo-plan-"))
  dirs.push(dir)
  return dir
}

function gitInit(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
  expect(Bun.spawnSync(["git", "init"], { cwd: dir, stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0)
}

function copyFixture(name: string, dest: string) {
  fs.cpSync(path.join(import.meta.dir, "../fixtures/multi-repo", name), dest, { recursive: true })
}

afterEach(() => {
  RepoWorkspace.Graph.invalidateGraphCache()
  RepoWorkspace.ChangeSet.clearChangeSets()
  RepoWorkspace.Scope.clearAllScopes()
  while (dirs.length) {
    const d = dirs.pop()
    if (d) fs.rmSync(d, { recursive: true, force: true })
  }
})

async function loadFixture() {
  const root = tmpRoot()
  for (const name of ["backend", "frontend", "shared-schema", "infra", "notes", "outside-workspace"]) {
    copyFixture(name, path.join(root, name))
  }
  for (const name of ["backend", "frontend", "shared-schema", "infra"]) gitInit(path.join(root, name))
  const info = await RepoWorkspace.loadFromFile(path.join(root, "backend", ".oimo", "workspace.yaml"))
  return { root, info }
}

describe("RepoWorkspace plan + scope + change set", () => {
  test("planFromImpact builds ordered plan; infra is review/no write scope", async () => {
    const { info } = await loadFixture()
    const impact = await RepoWorkspace.Graph.analyzeImpact(info, {
      query: "displayName OpenAPI",
      seedRepositoryId: "shared-schema",
    })
    const plan = RepoWorkspace.Plan.planFromImpact({ title: "Add displayName", impact })
    expect(plan.mustChange.some((m) => m.repositoryId === "shared-schema")).toBe(true)
    expect(plan.executionOrder[0]).toBe("shared-schema")
    const scope = RepoWorkspace.Plan.executionScopeFromPlan(plan, info)
    expect(scope).toContain("shared-schema")
    expect(scope).toContain("backend")
    expect(scope).toContain("frontend")
    expect(scope).not.toContain("infra")
  })

  test("assertWritableInScope denies read-only and out-of-scope", async () => {
    const { info } = await loadFixture()
    const scope = ["backend", "shared-schema"]
    expect(RepoWorkspace.Plan.assertWritableInScope({ info, scope, repositoryId: "backend" }).ok).toBe(true)
    expect(RepoWorkspace.Plan.assertWritableInScope({ info, scope, repositoryId: "frontend" }).ok).toBe(false)
    expect(RepoWorkspace.Plan.assertWritableInScope({ info, scope: ["infra"], repositoryId: "infra" }).ok).toBe(false)
  })

  test("beginChangeSet auto-approve sets scope and records status", async () => {
    const { info } = await loadFixture()
    const impact = await RepoWorkspace.Graph.analyzeImpact(info, {
      query: "displayName",
      seedRepositoryId: "shared-schema",
    })
    const plan = RepoWorkspace.Plan.planFromImpact({ title: "t", impact })
    const started = RepoWorkspace.Plan.beginChangeSet({
      sessionID: "s1",
      info,
      plan,
      autoApprove: true,
    })
    expect(started.changeSet.status).toBe("approved")
    expect(started.plan.approvedBy).toBe("auto")
    expect(started.logLine).toContain("[auto]")
    RepoWorkspace.ChangeSet.saveChangeSet(started.changeSet)
    RepoWorkspace.Scope.setScope("s1", started.changeSet.executionScope)

    let cs = RepoWorkspace.ChangeSet.loadChangeSet("s1")!
    cs = RepoWorkspace.ChangeSet.recordFileChange(cs, {
      repositoryId: "shared-schema",
      relativePath: "openapi.yaml",
      action: "modify",
    })
    cs = RepoWorkspace.ChangeSet.finalizeChangeSet(cs, "partial")
    expect(cs.status).toBe("partial")
    expect(cs.repos.find((r) => r.repositoryId === "shared-schema")?.files.length).toBe(1)
  })

  test("requiresPlan when writing beyond primary", async () => {
    const { info } = await loadFixture()
    expect(info.defaults.requireCrossRepoPlan).toBe(true)
    expect(RepoWorkspace.Plan.requiresPlan(info, ["backend"])).toBe(false)
    expect(RepoWorkspace.Plan.requiresPlan(info, ["backend", "frontend"])).toBe(true)
  })
})

describe("RepoWorkspace verify aggregation", () => {
  test("all skipped is not overall success", async () => {
    const { info } = await loadFixture()
    const verification = await RepoWorkspace.Verify.runVerify({
      info,
      repositoryId: "infra",
      dryRun: true,
    })
    // infra has no package.json — skipped
    const agg = RepoWorkspace.Verify.aggregateVerification([{ repositoryId: "infra", verification }])
    expect(agg.ok).toBe(false)
    expect(agg.summary).toContain("not successful")
  })

  test("detects package.json scripts on backend", async () => {
    const { root, info } = await loadFixture()
    const pkg = path.join(root, "backend", "package.json")
    const json = await Bun.file(pkg).json()
    json.scripts = { typecheck: "echo ok", test: "echo test" }
    await Bun.write(pkg, JSON.stringify(json, null, 2))
    const cmds = await RepoWorkspace.Verify.detectVerifyCommands(info, "backend")
    expect(cmds.some((c) => c.name === "typecheck")).toBe(true)
    const dry = await RepoWorkspace.Verify.runVerify({ info, repositoryId: "backend", dryRun: true })
    expect(dry.commands.every((c) => c.status === "not_run")).toBe(true)
    expect(dry.commands.every((c) => c.cwd === info.repositories.get("backend")!.canonicalPath)).toBe(true)
  })
})
