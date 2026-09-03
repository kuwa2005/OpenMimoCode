import * as fs from "fs"
import path from "path"
import { Global } from "@/global"
import type { GitSnapshot, Info, RepositoryDescriptor } from "./schema"
import { fingerprint, RepoWorkspaceError } from "./load"

export type SessionFingerprint = {
  version: 1
  sessionID: string
  capturedAt: number
  workspace: ReturnType<typeof fingerprint>
  git: Record<string, GitSnapshot>
}

function git(cwd: string, args: string[]) {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  return {
    ok: r.exitCode === 0,
    text: Buffer.from(r.stdout).toString("utf8").trim(),
  }
}

export function snapshotGit(repo: RepositoryDescriptor): GitSnapshot | undefined {
  if (repo.kind !== "git") return
  const head = git(repo.canonicalPath, ["rev-parse", "HEAD"])
  const branch = git(repo.canonicalPath, ["rev-parse", "--abbrev-ref", "HEAD"])
  const dirty = git(repo.canonicalPath, ["status", "--porcelain"])
  const remotes = git(repo.canonicalPath, ["remote"])
  return {
    head: head.ok ? head.text : undefined,
    branch: branch.ok && branch.text !== "HEAD" ? branch.text : undefined,
    dirty: dirty.ok ? dirty.text.length > 0 : false,
    remoteNames: remotes.ok ? remotes.text.split("\n").filter(Boolean) : [],
  }
}

export function capture(info: Info, sessionID: string): SessionFingerprint {
  const gitSnaps: Record<string, GitSnapshot> = {}
  for (const repo of info.repositories.values()) {
    const snap = snapshotGit(repo)
    if (snap) gitSnaps[repo.id] = snap
  }
  return {
    version: 1,
    sessionID,
    capturedAt: Date.now(),
    workspace: fingerprint(info),
    git: gitSnaps,
  }
}

function storePath(sessionID: string) {
  return path.join(Global.Path.data, "repo-workspace", "sessions", `${sessionID}.json`)
}

export async function save(sessionID: string, info: Info) {
  const file = storePath(sessionID)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  const data = capture(info, sessionID)
  await Bun.write(file, JSON.stringify(data, null, 2))
  return data
}

export async function load(sessionID: string): Promise<SessionFingerprint | undefined> {
  const file = storePath(sessionID)
  if (!fs.existsSync(file)) return
  return JSON.parse(await Bun.file(file).text()) as SessionFingerprint
}

export type ReconcileResult =
  | { ok: true; fingerprint: SessionFingerprint }
  | { ok: false; code: string; message: string; repositoryId?: string }

/**
 * Re-open a saved fingerprint against the live filesystem.
 * Does not guess moved paths — missing roots fail closed.
 */
export function reconcile(fp: SessionFingerprint): ReconcileResult {
  if (fp.version !== 1) {
    return { ok: false, code: "unsupported_version", message: `Unsupported fingerprint version ${fp.version}` }
  }
  if (!fs.existsSync(fp.workspace.configPath)) {
    return {
      ok: false,
      code: "config_missing",
      message: `Workspace config missing: ${fp.workspace.configPath}. Re-resolve the workspace; paths are not guessed.`,
    }
  }
  for (const repo of fp.workspace.repositories) {
    if (!fs.existsSync(repo.canonicalPath) || !fs.statSync(repo.canonicalPath).isDirectory()) {
      return {
        ok: false,
        code: "repository_missing",
        message: `Repository "${repo.id}" path missing: ${repo.canonicalPath}. Re-resolve; do not guess a new location.`,
        repositoryId: repo.id,
      }
    }
  }
  return { ok: true, fingerprint: fp }
}

export function assertReconciled(fp: SessionFingerprint) {
  const result = reconcile(fp)
  if (!result.ok) throw new RepoWorkspaceError(result.code, result.message, result.repositoryId)
  return result.fingerprint
}
