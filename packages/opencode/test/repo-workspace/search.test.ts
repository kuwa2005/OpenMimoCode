import { afterEach, describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { Effect } from "effect"
import * as RepoWorkspace from "../../src/repo-workspace"
import { Ripgrep } from "../../src/file/ripgrep"

const dirs: string[] = []
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "oimo-search-"))
  dirs.push(d)
  return d
}
function gitInit(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
  expect(Bun.spawnSync(["git", "init"], { cwd: dir }).exitCode).toBe(0)
}
afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop()
    if (d) fs.rmSync(d, { recursive: true, force: true })
  }
})

describe("RepoWorkspace.searchAcross", () => {
  test("returns repo-id prefixed matches", async () => {
    const root = tmp()
    const a = path.join(root, "frontend")
    const b = path.join(root, "backend")
    gitInit(a)
    gitInit(b)
    fs.writeFileSync(path.join(a, "app.ts"), "const displayName = 1\n")
    fs.writeFileSync(path.join(b, "app.ts"), "const displayName = 2\n")
    const list = path.join(root, ".oimo", "repos.txt")
    fs.mkdirSync(path.dirname(list), { recursive: true })
    fs.writeFileSync(
      list,
      ["name: demo", "primary: backend", "https://github.com/ex/frontend", "https://github.com/ex/backend"].join("\n"),
    )
    const info = await RepoWorkspace.loadFromReposList(list, root)
    const result = await Effect.runPromise(
      RepoWorkspace.searchAcross(info, {
        pattern: "displayName",
        repositoryIds: ["frontend", "backend"],
        limit: 10,
      }).pipe(Effect.provide(Ripgrep.defaultLayer)),
    )
    expect(result.matches.length).toBe(2)
    const text = RepoWorkspace.formatMatches(result.matches)
    expect(text).toContain("frontend:app.ts:")
    expect(text).toContain("backend:app.ts:")
  })
})
