import { afterEach, describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import * as RepoWorkspace from "../../src/repo-workspace"

const dirs: string[] = []

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oimo-graph-"))
  dirs.push(dir)
  return dir
}

function gitInit(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
  const r = Bun.spawnSync(["git", "init"], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  expect(r.exitCode).toBe(0)
}

function copyFixture(name: string, dest: string) {
  const src = path.join(import.meta.dir, "../fixtures/multi-repo", name)
  fs.cpSync(src, dest, { recursive: true })
}

afterEach(() => {
  RepoWorkspace.Graph.invalidateGraphCache()
  while (dirs.length) {
    const d = dirs.pop()
    if (d) fs.rmSync(d, { recursive: true, force: true })
  }
})

async function loadFixtureWorkspace() {
  const root = tmpRoot()
  for (const name of ["backend", "frontend", "shared-schema", "infra", "notes", "outside-workspace"]) {
    copyFixture(name, path.join(root, name))
  }
  for (const name of ["backend", "frontend", "shared-schema", "infra"]) {
    gitInit(path.join(root, name))
  }
  const info = await RepoWorkspace.loadFromFile(path.join(root, "backend", ".oimo", "workspace.yaml"))
  return { root, info }
}

describe("RepoWorkspace graph + impact", () => {
  test("detects file: deps and OpenAPI consumer edges with confidence", async () => {
    const { info } = await loadFixtureWorkspace()
    const graph = await RepoWorkspace.Graph.buildGraph(info)
    expect(graph.edges.length).toBeGreaterThan(0)
    const buildEdges = graph.edges.filter((e) => e.kind === "build" && e.source === "declared")
    expect(buildEdges.some((e) => e.from === "backend" && e.to === "shared-schema")).toBe(true)
    expect(buildEdges.some((e) => e.from === "frontend" && e.to === "shared-schema")).toBe(true)
    expect(buildEdges.every((e) => e.confidence === "confirmed")).toBe(true)
    const api = graph.edges.filter((e) => e.kind === "api")
    expect(api.some((e) => e.to === "shared-schema" && (e.from === "backend" || e.from === "frontend"))).toBe(true)
    expect(api.every((e) => e.evidence.length > 0)).toBe(true)
  })

  test("impact for displayName/OpenAPI marks schema+consumers, infra review/no_impact", async () => {
    const { info } = await loadFixtureWorkspace()
    const report = await RepoWorkspace.Graph.analyzeImpact(info, {
      query: "displayName OpenAPI",
      seedRepositoryId: "shared-schema",
    })
    const byId = Object.fromEntries(report.items.map((i) => [i.repositoryId, i]))
    expect(byId["shared-schema"]?.classification).toBe("must_change")
    expect(byId["backend"]?.classification).toBe("must_change")
    expect(byId["frontend"]?.classification).toBe("must_change")
    expect(["review", "no_impact"]).toContain(byId["infra"]?.classification)
    expect(report.executionOrder[0]).toBe("shared-schema")
    expect(report.executionOrder).toContain("backend")
    expect(report.executionOrder).toContain("frontend")
  })

  test("stale graph fingerprint after HEAD change forces rebuild flag", async () => {
    const { root, info } = await loadFixtureWorkspace()
    const graph = await RepoWorkspace.Graph.buildGraph(info)
    // Simulate HEAD change on backend
    const backend = info.repositories.get("backend")!
    backend.git = { ...(backend.git ?? { remoteNames: [], dirty: false }), head: "deadbeef" }
    const report = await RepoWorkspace.Graph.analyzeImpact(info, {
      query: "displayName",
      seedRepositoryId: "shared-schema",
      graph,
    })
    expect(report.stale).toBe(true)
    expect(report.graphFingerprint).not.toBe(graph.fingerprint)
    void root
  })

  test("secret-looking paths are not used as graph evidence", () => {
    expect(RepoWorkspace.Graph.isSecretCandidatePath(".env")).toBe(true)
    expect(RepoWorkspace.Graph.isSecretCandidatePath("secrets/token")).toBe(true)
    expect(RepoWorkspace.Graph.isSecretCandidatePath("openapi.yaml")).toBe(false)
  })
})
