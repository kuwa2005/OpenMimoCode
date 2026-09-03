import * as fs from "fs"
import path from "path"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import type { Access, File, RepositoryConfig } from "./schema"
import { RepoWorkspaceError } from "./error"

export type ReposListLine = {
  url?: string
  /** Absolute or relative local path (when not a remote URL). */
  path?: string
  id: string
  access: Access
  role?: string
}

export type ReposListFile = {
  name: string
  primary?: string
  repositories: ReposListLine[]
}

const URL_RE = /^(https?:\/\/|git@)/i

/**
 * Parse a plain-text multi-repo list.
 *
 * Supported lines (copy-paste friendly):
 *   https://github.com/org/frontend
 *   https://github.com/org/infra read-only
 *   https://github.com/org/api id=backend
 *   ../already-cloned-app
 *   name: customer-platform
 *   primary: backend
 *   # comments and blank lines ignored
 */
export function parseReposList(text: string): ReposListFile {
  let name = "workspace"
  let primary: string | undefined
  const repositories: ReposListLine[] = []
  const seen = new Set<string>()

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue

    const named = line.match(/^name\s*:\s*(.+)$/i)
    if (named) {
      name = named[1].trim()
      continue
    }
    const prim = line.match(/^primary\s*:\s*(.+)$/i)
    if (prim) {
      primary = prim[1].trim()
      continue
    }

    const parts = line.split(/\s+/)
    const target = parts[0]
    let access: Access = "read-write"
    let idOverride: string | undefined
    let role: string | undefined
    for (const part of parts.slice(1)) {
      if (part === "read-only" || part === "readonly") access = "read-only"
      if (part === "read-write" || part === "readwrite") access = "read-write"
      const idm = part.match(/^id=([A-Za-z0-9_.-]+)$/i)
      if (idm) idOverride = idm[1]
      const rolem = part.match(/^role=(.+)$/i)
      if (rolem) role = rolem[1]
    }

    const id = idOverride ?? deriveId(target)
    if (seen.has(id)) {
      throw new RepoWorkspaceError("duplicate_id", `Duplicate repository id "${id}" in repos list`, id)
    }
    seen.add(id)

    if (URL_RE.test(target)) {
      repositories.push({ url: target.replace(/\.git$/i, ""), id, access, role })
    } else {
      repositories.push({ path: target, id, access, role })
    }
  }

  if (repositories.length === 0) {
    throw new RepoWorkspaceError("empty_repos_list", "repos list has no repositories")
  }

  return { name, primary: primary ?? repositories[0].id, repositories }
}

export function deriveId(target: string) {
  const cleaned = target.replace(/\.git$/i, "").replace(/\/$/, "")
  const segment = cleaned.split(/[/\\]/).filter(Boolean).at(-1) ?? "repo"
  return segment.replace(/[^A-Za-z0-9_.-]/g, "-")
}

export const REPOS_LIST_NAMES = ["repos.txt", "repos.list", "repositories.txt"] as const

export function candidateReposListPaths(primaryRoot: string) {
  const root = AppFileSystem.resolve(primaryRoot)
  return [
    ...REPOS_LIST_NAMES.map((n) => path.join(root, ".oimo", n)),
    ...REPOS_LIST_NAMES.map((n) => path.join(root, n)),
  ]
}

export function findReposListPath(primaryRoot: string): string | undefined {
  for (const p of candidateReposListPaths(primaryRoot)) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
}

/**
 * Resolve a repos list into a workspace File schema.
 * Remote URLs expect a local clone at `<baseDir>/<id>/` (same folder as siblings).
 */
export function reposListToFile(list: ReposListFile, baseDir: string): File {
  const repositories: RepositoryConfig[] = list.repositories.map((entry) => {
    if (entry.path) {
      return {
        id: entry.id,
        path: entry.path,
        access: entry.access,
        role: entry.role ?? (entry.url ? `clone of ${entry.url}` : undefined),
        kind: "git" as const,
      }
    }
    const local = path.join(baseDir, entry.id)
    return {
      id: entry.id,
      path: local,
      access: entry.access,
      role: entry.url ? `clone of ${entry.url}` : entry.role,
      kind: "git" as const,
    }
  })

  return {
    version: 1,
    name: list.name,
    primary: list.primary ?? repositories[0].id,
    repositories,
    defaults: {
      allow_unregistered_reads: false,
      allow_unregistered_writes: false,
      require_cross_repo_plan: true,
    },
  }
}

export function missingClones(list: ReposListFile, baseDir: string) {
  return list.repositories.flatMap((entry) => {
    if (entry.path) {
      const abs = AppFileSystem.resolve(path.resolve(baseDir, entry.path))
      if (fs.existsSync(abs)) return []
      return [{ id: entry.id, expectedPath: abs, url: entry.url }]
    }
    const abs = AppFileSystem.resolve(path.join(baseDir, entry.id))
    if (fs.existsSync(abs)) return []
    return [{ id: entry.id, expectedPath: abs, url: entry.url }]
  })
}

/** One-line clone hints for doctor / CLI. */
export function cloneCommands(list: ReposListFile, baseDir: string) {
  return missingClones(list, baseDir).flatMap((m) => {
    if (!m.url) return [`# missing local path for ${m.id}: ${m.expectedPath}`]
    return [`git clone ${m.url} ${m.expectedPath}`]
  })
}
