import * as fs from "fs"
import path from "path"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"

export type GitmodulesEntry = {
  name: string
  path: string
  url?: string
  branch?: string
}

/** Parse a `.gitmodules` file into entries. Ignores unknown keys. */
export function parseGitmodules(text: string): GitmodulesEntry[] {
  const entries: GitmodulesEntry[] = []
  let current: GitmodulesEntry | undefined
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#") || line.startsWith(";")) continue
    const section = line.match(/^\[submodule\s+"([^"]+)"\]$/)
    if (section) {
      current = { name: section[1], path: "" }
      entries.push(current)
      continue
    }
    if (!current) continue
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/)
    if (!kv) continue
    const key = kv[1].toLowerCase()
    const value = kv[2].trim()
    if (key === "path") current.path = value
    if (key === "url") current.url = value
    if (key === "branch") current.branch = value
  }
  return entries.filter((e) => e.path.length > 0)
}

export function readGitmodules(superprojectRoot: string): GitmodulesEntry[] | undefined {
  const file = path.join(superprojectRoot, ".gitmodules")
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return
  return parseGitmodules(fs.readFileSync(file, "utf8"))
}

export function isSuperproject(dir: string) {
  const root = AppFileSystem.resolve(dir)
  return Boolean(readGitmodules(root)?.length)
}

function git(cwd: string, args: string[]) {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" })
  return {
    ok: r.exitCode === 0,
    text: Buffer.from(r.stdout).toString("utf8").trim(),
    stderr: Buffer.from(r.stderr).toString("utf8").trim(),
  }
}

export type SubmoduleState = {
  name: string
  path: string
  url?: string
  /** branch key from .gitmodules (tracking intent), if any */
  trackingBranch?: string
  /** commit recorded in the superproject tree (gitlink) */
  recordedCommit?: string
  /** commit currently checked out in the submodule worktree */
  checkedOutCommit?: string
  /** active branch in the submodule worktree, if any */
  checkedOutBranch?: string
  remoteNames: string[]
  initialized: boolean
  dirty: boolean
  /** recordedCommit !== checkedOutCommit when both known */
  commitMismatch: boolean
  /** checked out tip appears behind origin/<trackingBranch> when fetchable locally */
  behindTrackingBranch: boolean
  /** human-readable warnings for impact analysis */
  warnings: string[]
}

function recordedCommit(superRoot: string, relPath: string): string | undefined {
  const r = git(superRoot, ["ls-tree", "HEAD", relPath])
  if (!r.ok || !r.text) return
  // 160000 commit <sha>\tpath
  const m = r.text.match(/^\s*160000\s+commit\s+([0-9a-f]{7,40})\s+/)
  return m?.[1]
}

function submoduleInitialized(abs: string) {
  const gitPath = path.join(abs, ".git")
  return fs.existsSync(gitPath)
}

/**
 * Inspect one submodule relative to a superproject root.
 * Never runs network fetch/update — only local git state.
 */
export function inspectSubmodule(superRoot: string, entry: GitmodulesEntry): SubmoduleState {
  const abs = AppFileSystem.resolve(path.join(superRoot, entry.path))
  const warnings: string[] = []
  const initialized = submoduleInitialized(abs)
  const recorded = recordedCommit(superRoot, entry.path)

  if (!initialized) {
    warnings.push(`Submodule "${entry.name}" is not initialized (no checkout under ${entry.path}).`)
    return {
      name: entry.name,
      path: entry.path,
      url: entry.url,
      trackingBranch: entry.branch,
      recordedCommit: recorded,
      remoteNames: [],
      initialized: false,
      dirty: false,
      commitMismatch: Boolean(recorded),
      behindTrackingBranch: false,
      warnings,
    }
  }

  const head = git(abs, ["rev-parse", "HEAD"])
  const branch = git(abs, ["rev-parse", "--abbrev-ref", "HEAD"])
  const dirty = git(abs, ["status", "--porcelain"])
  const remotes = git(abs, ["remote"])
  const checkedOut = head.ok ? head.text : undefined
  const commitMismatch = Boolean(recorded && checkedOut && !checkedOut.startsWith(recorded) && !recorded.startsWith(checkedOut))

  if (commitMismatch) {
    warnings.push(
      `Submodule "${entry.name}" checkout (${checkedOut?.slice(0, 7)}) differs from superproject gitlink (${recorded?.slice(0, 7)}). Impact analysis may use a different revision than the workspace pins.`,
    )
  }

  let behindTrackingBranch = false
  if (entry.branch && checkedOut) {
    const remoteTip = git(abs, ["rev-parse", "--verify", `refs/remotes/origin/${entry.branch}`])
    if (remoteTip.ok && remoteTip.text !== checkedOut) {
      const mb = git(abs, ["merge-base", "--is-ancestor", checkedOut, remoteTip.text])
      // exit 0 => checkedOut is ancestor of remote tip => behind
      if (mb.ok) {
        behindTrackingBranch = true
        warnings.push(
          `Submodule "${entry.name}" appears behind origin/${entry.branch}. Continue impact analysis only with caution; do not auto-update without approval.`,
        )
      }
    }
  }

  if (dirty.ok && dirty.text.length > 0) {
    warnings.push(`Submodule "${entry.name}" has a dirty worktree; do not stash/reset automatically.`)
  }

  return {
    name: entry.name,
    path: entry.path,
    url: entry.url,
    trackingBranch: entry.branch,
    recordedCommit: recorded,
    checkedOutCommit: checkedOut,
    checkedOutBranch: branch.ok && branch.text !== "HEAD" ? branch.text : undefined,
    remoteNames: remotes.ok ? remotes.text.split("\n").filter(Boolean) : [],
    initialized: true,
    dirty: dirty.ok ? dirty.text.length > 0 : false,
    commitMismatch,
    behindTrackingBranch,
    warnings,
  }
}

export function inspectAll(superRoot: string): SubmoduleState[] {
  const entries = readGitmodules(superRoot)
  if (!entries?.length) return []
  return entries.map((e) => inspectSubmodule(superRoot, e))
}

/** Stable repository id from submodule name/path. */
export function submoduleRepoId(entry: GitmodulesEntry) {
  const base = entry.name.replace(/\\/g, "/").split("/").filter(Boolean).at(-1)
  const fromPath = entry.path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1)
  return (base || fromPath || "submodule").replace(/[^A-Za-z0-9_.-]/g, "-")
}
