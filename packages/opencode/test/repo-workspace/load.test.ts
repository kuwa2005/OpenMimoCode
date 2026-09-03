import { afterEach, describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import * as RepoWorkspace from "../../src/repo-workspace"

const dirs: string[] = []

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oimo-multirepo-"))
  dirs.push(dir)
  return dir
}

function gitInit(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
  const r = Bun.spawnSync(["git", "init"], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  expect(r.exitCode).toBe(0)
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop()
    if (d) fs.rmSync(d, { recursive: true, force: true })
  }
})

describe("RepoWorkspace load + validate", () => {
  test("loads yaml workspace with three sibling git repos", async () => {
    const root = tmpRoot()
    const backend = path.join(root, "backend")
    const frontend = path.join(root, "frontend")
    const schema = path.join(root, "shared-schema")
    gitInit(backend)
    gitInit(frontend)
    gitInit(schema)

    const configDir = path.join(backend, ".oimo")
    fs.mkdirSync(configDir, { recursive: true })
    const configPath = path.join(configDir, "workspace.yaml")
    fs.writeFileSync(
      configPath,
      [
        "version: 1",
        "name: customer-platform",
        "primary: backend",
        "repositories:",
        "  - id: backend",
        "    path: .",
        "    role: API",
        "  - id: frontend",
        "    path: ../frontend",
        "    role: Web UI",
        "  - id: shared-schema",
        "    path: ../shared-schema",
        "    role: schema",
        "  - id: notes",
        "    path: ../notes",
        "    kind: directory",
        "    access: read-only",
        "defaults:",
        "  allow_unregistered_writes: false",
      ].join("\n"),
    )
    fs.mkdirSync(path.join(root, "notes"), { recursive: true })

    const info = await RepoWorkspace.loadFromFile(configPath, backend)
    expect(info.name).toBe("customer-platform")
    expect(info.primaryRepositoryId).toBe("backend")
    expect(info.repositories.size).toBe(4)
    expect(info.repositories.get("frontend")?.canonicalPath).toBe(RepoWorkspace.gitWorktreeRoot(frontend))
    expect(info.repositories.get("notes")?.kind).toBe("directory")
    expect(info.repositories.get("notes")?.access).toBe("read-only")
    expect(info.defaults.requireCrossRepoPlan).toBe(true)

    const report = RepoWorkspace.doctor(info)
    expect(report.ok).toBe(true)
    expect(report.repositoryCount).toBe(4)
  })

  test("rejects nested repositories", async () => {
    const root = tmpRoot()
    const outer = path.join(root, "outer")
    const inner = path.join(outer, "inner")
    gitInit(outer)
    gitInit(inner)
    const configPath = path.join(outer, "workspace.json")
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        name: "bad",
        primary: "outer",
        repositories: [
          { id: "outer", path: "." },
          { id: "inner", path: "inner" },
        ],
      }),
    )
    expect(RepoWorkspace.loadFromFile(configPath, outer)).rejects.toMatchObject({ code: "nested_repositories" })
  })

  test("rejects non-git without kind directory", async () => {
    const root = tmpRoot()
    const backend = path.join(root, "backend")
    const plain = path.join(root, "plain")
    gitInit(backend)
    fs.mkdirSync(plain, { recursive: true })
    const configPath = path.join(backend, "workspace.json")
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        name: "bad",
        primary: "backend",
        repositories: [
          { id: "backend", path: "." },
          { id: "plain", path: "../plain" },
        ],
      }),
    )
    expect(RepoWorkspace.loadFromFile(configPath, backend)).rejects.toMatchObject({ code: "not_a_git_repository" })
  })

  test("rejects path that is not git root", async () => {
    const root = tmpRoot()
    const backend = path.join(root, "backend")
    gitInit(backend)
    const sub = path.join(backend, "src")
    fs.mkdirSync(sub)
    const configPath = path.join(backend, "workspace.json")
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        name: "bad",
        primary: "sub",
        repositories: [{ id: "sub", path: "src" }],
      }),
    )
    expect(RepoWorkspace.loadFromFile(configPath, backend)).rejects.toMatchObject({ code: "not_git_root" })
  })

  test("findConfigPath prefers .oimo/workspace.yaml", async () => {
    const root = tmpRoot()
    gitInit(root)
    fs.mkdirSync(path.join(root, ".oimo"), { recursive: true })
    fs.writeFileSync(
      path.join(root, ".oimo", "workspace.yaml"),
      ["version: 1", "name: x", "primary: a", "repositories:", "  - id: a", "    path: ."].join("\n"),
    )
    expect(await RepoWorkspace.findConfigPath(root)).toBe(path.join(root, ".oimo", "workspace.yaml"))
    const info = await RepoWorkspace.loadFromPrimary(root)
    expect(info?.primaryRepositoryId).toBe("a")
  })

  test("fixture workspace.yaml loads after git init in a temp copy", async () => {
    const src = path.join(import.meta.dir, "../fixtures/multi-repo")
    const root = tmpRoot()
    for (const name of ["backend", "frontend", "shared-schema", "infra", "notes", "outside-workspace"]) {
      fs.cpSync(path.join(src, name), path.join(root, name), { recursive: true })
    }
    for (const name of ["backend", "frontend", "shared-schema", "infra"]) {
      gitInit(path.join(root, name))
    }
    const info = await RepoWorkspace.loadFromPrimary(path.join(root, "backend"))
    expect(info?.name).toBe("fixture-platform")
    expect(info?.repositories.size).toBe(5)
    expect(info?.repositories.get("infra")?.access).toBe("read-only")
    const outside = RepoWorkspace.resolveWrite(info!, {
      absolutePath: path.join(root, "outside-workspace", "secret.txt"),
    })
    expect(outside.ok).toBe(false)
  })
})

describe("RepoWorkspace resolver", () => {
  test("locate and read/write access", async () => {
    const root = tmpRoot()
    const backend = path.join(root, "backend")
    const infra = path.join(root, "infra")
    gitInit(backend)
    gitInit(infra)
    fs.writeFileSync(path.join(backend, "app.ts"), "export {}\n")
    fs.writeFileSync(path.join(infra, "main.tf"), "")

    const configPath = path.join(backend, "workspace.json")
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        name: "sys",
        primary: "backend",
        repositories: [
          { id: "backend", path: "." },
          { id: "infra", path: "../infra", access: "read-only" },
        ],
      }),
    )
    const info = await RepoWorkspace.loadFromFile(configPath, backend)

    const hit = RepoWorkspace.locate(info, path.join(backend, "app.ts"))
    expect(hit?.location).toEqual({ repositoryId: "backend", relativePath: "app.ts" })
    expect(RepoWorkspace.formatLocation(hit!.location)).toBe("backend:app.ts")

    const writeOk = RepoWorkspace.resolveWrite(info, { repositoryId: "backend", path: "app.ts" })
    expect(writeOk.ok).toBe(true)

    const writeDeny = RepoWorkspace.resolveWrite(info, { repositoryId: "infra", path: "main.tf" })
    expect(writeDeny.ok).toBe(false)
    if (!writeDeny.ok) expect(writeDeny.code).toBe("read_only")

    const outside = RepoWorkspace.resolveWrite(info, { absolutePath: path.join(root, "outside.txt") })
    expect(outside.ok).toBe(false)
    if (!outside.ok) expect(outside.code).toBe("unregistered")

    const traversal = () => RepoWorkspace.resolveAbsolute(info, "backend", "../infra/main.tf")
    expect(traversal).toThrow()

    const fp = RepoWorkspace.fingerprint(info)
    expect(fp.repositories.map((r) => r.id).sort()).toEqual(["backend", "infra"])

    const saved = await RepoWorkspace.SessionFingerprint.save("ses_test", info)
    expect(saved.git.backend).toBeDefined()
    expect(typeof saved.git.backend!.dirty).toBe("boolean")
    const loaded = await RepoWorkspace.SessionFingerprint.load("ses_test")
    expect(loaded?.workspace.primaryRepositoryId).toBe("backend")
    expect(RepoWorkspace.SessionFingerprint.reconcile(loaded!).ok).toBe(true)

    const moved = structuredClone(loaded!)
    moved.workspace.repositories[0].canonicalPath = path.join(root, "gone")
    const bad = RepoWorkspace.SessionFingerprint.reconcile(moved)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.code).toBe("repository_missing")
  })
})
