import * as fs from "fs"
import path from "path"
import { ConfigParse } from "@/config"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { RepoWorkspaceError } from "./error"
import {
  inspectAll,
  isSuperproject,
  readGitmodules,
  submoduleRepoId,
  type SubmoduleState,
} from "./gitmodules"
import { findReposListPath, parseReposList, reposListToFile } from "./repos-list"
import type { Access, File, Info, Kind, RepositoryDescriptor } from "./schema"
import { File as FileSchema } from "./schema"

export { RepoWorkspaceError }

const CONFIG_NAMES = ["workspace.yaml", "workspace.yml", "workspace.json", "workspace.jsonc"] as const

/** Candidate config paths under a primary checkout (`.oimo/` then worktree root). */
export function candidatePaths(primaryRoot: string) {
  const root = AppFileSystem.resolve(primaryRoot)
  return [
    ...CONFIG_NAMES.map((name) => path.join(root, ".oimo", name)),
    ...CONFIG_NAMES.map((name) => path.join(root, name)),
  ]
}

export async function findConfigPath(primaryRoot: string): Promise<string | undefined> {
  for (const p of candidatePaths(primaryRoot)) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
}

function parseText(text: string, filepath: string): unknown {
  const lower = filepath.toLowerCase()
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return Bun.YAML.parse(text)
  if (lower.endsWith(".jsonc") || lower.endsWith(".json")) return ConfigParse.jsonc(text, filepath)
  throw new RepoWorkspaceError("unsupported_format", `Unsupported workspace config: ${filepath}`)
}

function decodeFile(data: unknown, source: string): File {
  return ConfigParse.schema(FileSchema.zod, data, source)
}

function defaultAccess(kind: Kind, access?: Access): Access {
  if (access) return access
  if (kind === "directory" || kind === "superproject") return "read-only"
  return "read-write"
}

/** Return the git worktree root containing `dir`, or undefined. */
export function gitWorktreeRoot(dir: string): string | undefined {
  let cur = path.resolve(dir)
  while (true) {
    const candidate = path.join(cur, ".git")
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate)
      if (stat.isDirectory() || stat.isFile()) return AppFileSystem.resolve(cur)
    }
    const parent = path.dirname(cur)
    if (parent === cur) return
    cur = parent
  }
}

function assertGitRoot(abs: string, id: string, kind: Kind) {
  if (kind === "submodule") {
    // Uninitialized submodule may lack .git; path must still exist as directory or be absent → doctor.
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return
    // Allow missing path for uninitialized — doctor reports it
    return
  }
  const root = gitWorktreeRoot(abs)
  if (!root) {
    throw new RepoWorkspaceError(
      "not_a_git_repository",
      `Repository "${id}" at ${abs} is not inside a git repository. Use kind: directory for non-git paths.`,
      id,
    )
  }
  if (root !== AppFileSystem.resolve(abs)) {
    throw new RepoWorkspaceError(
      "not_git_root",
      `Repository "${id}" path must be the git worktree root (${root}), not a subdirectory (${abs}).`,
      id,
    )
  }
}

function assertDirectory(abs: string, id: string, kind: Kind) {
  if (kind === "submodule" && (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory())) return
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new RepoWorkspaceError("path_missing", `Repository "${id}" path does not exist: ${abs}`, id)
  }
}

function isNested(a: string, b: string) {
  if (a === b) return false
  return AppFileSystem.contains(a, b) || AppFileSystem.contains(b, a)
}

function allowedNesting(a: RepositoryDescriptor, b: RepositoryDescriptor) {
  // Superproject may contain submodules; sibling nested git roots are still rejected.
  if (a.kind === "superproject" && b.kind === "submodule" && AppFileSystem.contains(a.canonicalPath, b.canonicalPath)) {
    return true
  }
  if (b.kind === "superproject" && a.kind === "submodule" && AppFileSystem.contains(b.canonicalPath, a.canonicalPath)) {
    return true
  }
  if (a.kind === "submodule" && b.kind === "submodule") {
    // Two submodules under the same tree are ok if neither contains the other as nested accidental path —
    // if they nest, still reject.
    return false
  }
  return false
}

/**
 * Load and validate a repo-workspace config.
 * `baseDir` resolves relative repository paths (usually the primary checkout root).
 */
export async function loadFromFile(configPath: string, baseDir?: string): Promise<Info> {
  const resolvedConfig = AppFileSystem.resolve(configPath)
  const text = await Bun.file(resolvedConfig).text()
  const file = decodeFile(parseText(text, resolvedConfig), resolvedConfig)
  const configDir = path.dirname(resolvedConfig)
  const inferredBase = path.basename(configDir) === ".oimo" ? path.dirname(configDir) : configDir
  const base = AppFileSystem.resolve(baseDir ?? inferredBase)
  return materialize(file, resolvedConfig, base)
}

export async function loadFromReposList(listPath: string, baseDir?: string): Promise<Info> {
  const resolved = AppFileSystem.resolve(listPath)
  const text = await Bun.file(resolved).text()
  const list = parseReposList(text)
  const configDir = path.dirname(resolved)
  const inferredBase = path.basename(configDir) === ".oimo" ? path.dirname(configDir) : configDir
  const base = AppFileSystem.resolve(baseDir ?? inferredBase)
  const file = reposListToFile(list, base)
  return materialize(file, resolved, base)
}

/** Build workspace from `.gitmodules` (superproject + each submodule). */
export function loadFromGitmodules(superRoot: string): Info {
  const root = AppFileSystem.resolve(superRoot)
  const entries = readGitmodules(root)
  if (!entries?.length) {
    throw new RepoWorkspaceError("not_a_superproject", `No .gitmodules under ${root}`)
  }

  const superId = path.basename(root) || "superproject"
  const states = inspectAll(root)
  const byPath = new Map(states.map((s) => [s.path, s]))

  const repositories: File["repositories"] = [
    {
      id: superId,
      path: ".",
      kind: "superproject",
      access: "read-only",
      role: "Git submodule superproject (workspace management; prefer implementing in submodules)",
    },
    ...entries.map((e) => ({
      id: submoduleRepoId(e),
      path: e.path,
      kind: "submodule" as const,
      access: "read-write" as const,
      role: e.url ? `submodule ${e.name} (${e.url})` : `submodule ${e.name}`,
    })),
  ]

  const file: File = {
    version: 1,
    name: `${superId}-superproject`,
    primary: submoduleRepoId(entries[0]),
    repositories,
    defaults: {
      allow_unregistered_reads: false,
      allow_unregistered_writes: false,
      require_cross_repo_plan: true,
    },
  }

  const info = materialize(file, path.join(root, ".gitmodules"), root)
  info.layout = "superproject"
  info.superprojectId = superId
  info.submodules = states
  // Prefer first initialized submodule as primary for app work; keep superproject out of primary.
  const firstReady = states.find((s) => s.initialized)
  if (firstReady) {
    const id = submoduleRepoId(entries.find((e) => e.path === firstReady.path) ?? entries[0])
    if (info.repositories.has(id)) info.primaryRepositoryId = id
  }
  for (const repo of info.repositories.values()) {
    if (repo.kind !== "submodule") continue
    const state = byPath.get(repo.configuredPath) ?? byPath.get(path.relative(root, repo.canonicalPath))
    if (state) repo.submodule = state
  }
  return info
}

/**
 * Load from primary root by discovering config in order:
 * 1. `.oimo/workspace.*` / `workspace.*`
 * 2. `.oimo/repos.txt` / `repos.txt` (GitHub URL list)
 * 3. `.gitmodules` superproject auto-detection
 */
export async function loadFromPrimary(primaryRoot: string): Promise<Info | undefined> {
  const root = AppFileSystem.resolve(primaryRoot)
  const configPath = await findConfigPath(root)
  if (configPath) return loadFromFile(configPath, root)

  const listPath = findReposListPath(root)
  if (listPath) return loadFromReposList(listPath, root)

  if (isSuperproject(root)) return loadFromGitmodules(root)
}

export function materialize(file: File, configPath: string, baseDir: string): Info {
  if (!file.repositories.some((r) => r.id === file.primary)) {
    throw new RepoWorkspaceError("primary_missing", `primary "${file.primary}" is not listed in repositories`)
  }

  const seenIds = new Set<string>()
  const seenCanonical = new Map<string, string>()
  const repositories = new Map<string, RepositoryDescriptor>()

  for (const entry of file.repositories) {
    if (seenIds.has(entry.id)) {
      throw new RepoWorkspaceError("duplicate_id", `Duplicate repository id "${entry.id}"`, entry.id)
    }
    seenIds.add(entry.id)

    const kind: Kind = entry.kind ?? "git"
    const abs = AppFileSystem.resolve(path.resolve(baseDir, entry.path))
    assertDirectory(abs, entry.id, kind)

    if (kind === "git" || kind === "superproject") assertGitRoot(abs, entry.id, kind)
    if (kind === "submodule") assertGitRoot(abs, entry.id, kind)
    if (kind === "directory") {
      const root = gitWorktreeRoot(abs)
      if (root && root === AppFileSystem.resolve(abs)) {
        throw new RepoWorkspaceError(
          "directory_is_git",
          `Repository "${entry.id}" is a git root; omit kind or use kind: git`,
          entry.id,
        )
      }
    }

    const canonical = fs.existsSync(abs) ? AppFileSystem.resolve(abs) : abs
    const prior = seenCanonical.get(canonical)
    if (prior) {
      throw new RepoWorkspaceError(
        "duplicate_path",
        `Repositories "${prior}" and "${entry.id}" resolve to the same path ${canonical}`,
        entry.id,
      )
    }
    seenCanonical.set(canonical, entry.id)

    repositories.set(entry.id, {
      id: entry.id,
      rootPath: abs,
      canonicalPath: canonical,
      kind,
      role: entry.role,
      access: defaultAccess(kind, entry.access),
      configuredPath: entry.path,
    })
  }

  for (const a of repositories.values()) {
    for (const b of repositories.values()) {
      if (a.id >= b.id) continue
      if (!isNested(a.canonicalPath, b.canonicalPath)) continue
      if (allowedNesting(a, b)) continue
      throw new RepoWorkspaceError(
        "nested_repositories",
        `Repositories "${a.id}" (${a.canonicalPath}) and "${b.id}" (${b.canonicalPath}) are nested; register siblings only (submodule nesting under a superproject is allowed)`,
        a.id,
      )
    }
  }

  const layout = [...repositories.values()].some((r) => r.kind === "superproject") ? "superproject" : "siblings"

  return {
    name: file.name,
    configPath,
    primaryRepositoryId: file.primary,
    repositories,
    layout,
    defaults: {
      allowUnregisteredReads: file.defaults?.allow_unregistered_reads ?? false,
      allowUnregisteredWrites: file.defaults?.allow_unregistered_writes ?? false,
      requireCrossRepoPlan: file.defaults?.require_cross_repo_plan ?? true,
    },
  }
}

/** Snapshot suitable for session persistence (Phase 1 fingerprint). */
export function fingerprint(info: Info) {
  return {
    name: info.name,
    configPath: info.configPath,
    primaryRepositoryId: info.primaryRepositoryId,
    layout: info.layout ?? "siblings",
    superprojectId: info.superprojectId,
    repositories: [...info.repositories.values()].map((r) => ({
      id: r.id,
      canonicalPath: r.canonicalPath,
      kind: r.kind,
      access: r.access,
      role: r.role,
      submodule: r.submodule
        ? {
            recordedCommit: r.submodule.recordedCommit,
            checkedOutCommit: r.submodule.checkedOutCommit,
            trackingBranch: r.submodule.trackingBranch,
            initialized: r.submodule.initialized,
            dirty: r.submodule.dirty,
            commitMismatch: r.submodule.commitMismatch,
            behindTrackingBranch: r.submodule.behindTrackingBranch,
          }
        : undefined,
    })),
    defaults: info.defaults,
  }
}

export type { SubmoduleState }
