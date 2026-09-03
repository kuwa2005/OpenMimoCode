import path from "path"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import type { Access, Info, Location, RepositoryDescriptor } from "./schema"
import { RepoWorkspaceError } from "./load"

export type ResolveWriteResult =
  | { ok: true; repository: RepositoryDescriptor; location: Location; absolutePath: string }
  | { ok: false; code: "unregistered" | "read_only" | "outside_root"; message: string }

export type ResolveReadResult =
  | { ok: true; repository: RepositoryDescriptor; location: Location; absolutePath: string }
  | { ok: false; code: "unregistered" | "outside_root"; message: string }

/** Longest-prefix match of an absolute path against registered repository roots. */
export function locate(info: Info, filepath: string): { repository: RepositoryDescriptor; location: Location } | undefined {
  const full = AppFileSystem.resolve(filepath)
  let best: RepositoryDescriptor | undefined
  for (const repo of info.repositories.values()) {
    if (!AppFileSystem.contains(repo.canonicalPath, full) && repo.canonicalPath !== full) continue
    if (!best || repo.canonicalPath.length > best.canonicalPath.length) best = repo
  }
  if (!best) return
  const relativePath = full === best.canonicalPath ? "." : path.relative(best.canonicalPath, full).split(path.sep).join("/")
  return {
    repository: best,
    location: { repositoryId: best.id, relativePath },
  }
}

export function rootOf(info: Info, repositoryId: string): RepositoryDescriptor {
  const repo = info.repositories.get(repositoryId)
  if (!repo) throw new RepoWorkspaceError("unknown_repository", `Unknown repository id "${repositoryId}"`, repositoryId)
  return repo
}

export function resolveAbsolute(info: Info, repositoryId: string, relativePath: string): string {
  const repo = rootOf(info, repositoryId)
  const joined = path.resolve(repo.canonicalPath, relativePath)
  const abs = AppFileSystem.resolve(joined)
  if (!AppFileSystem.contains(repo.canonicalPath, abs) && abs !== repo.canonicalPath) {
    throw new RepoWorkspaceError(
      "path_escapes_repository",
      `Path escapes repository "${repositoryId}": ${relativePath}`,
      repositoryId,
    )
  }
  return abs
}

export function formatLocation(location: Location) {
  return `${location.repositoryId}:${location.relativePath}`
}

export function canWrite(access: Access) {
  return access === "read-write"
}

/** Resolve a write target. Phase 1 callers should treat failure as hard deny for non-primary until Phase 4. */
export function resolveWrite(
  info: Info,
  input: { repositoryId?: string; path: string } | { absolutePath: string },
): ResolveWriteResult {
  if ("absolutePath" in input) {
    const hit = locate(info, input.absolutePath)
    if (!hit) {
      if (info.defaults.allowUnregisteredWrites) {
        return { ok: false, code: "unregistered", message: "Unregistered writes are not implemented via Resolver" }
      }
      return { ok: false, code: "unregistered", message: `Path is outside registered repositories: ${input.absolutePath}` }
    }
    if (!canWrite(hit.repository.access)) {
      return {
        ok: false,
        code: "read_only",
        message: `Repository "${hit.repository.id}" is read-only`,
      }
    }
    return {
      ok: true,
      repository: hit.repository,
      location: hit.location,
      absolutePath: AppFileSystem.resolve(input.absolutePath),
    }
  }

  const repositoryId = input.repositoryId ?? info.primaryRepositoryId
  const abs = resolveAbsolute(info, repositoryId, input.path)
  const repo = rootOf(info, repositoryId)
  if (!canWrite(repo.access)) {
    return { ok: false, code: "read_only", message: `Repository "${repositoryId}" is read-only` }
  }
  const hit = locate(info, abs)
  if (!hit || hit.repository.id !== repositoryId) {
    return { ok: false, code: "outside_root", message: `Path outside repository "${repositoryId}"` }
  }
  return { ok: true, repository: repo, location: hit.location, absolutePath: abs }
}

export function resolveRead(
  info: Info,
  input: { repositoryId?: string; path: string } | { absolutePath: string },
): ResolveReadResult {
  if ("absolutePath" in input) {
    const hit = locate(info, input.absolutePath)
    if (!hit) {
      return { ok: false, code: "unregistered", message: `Path is outside registered repositories: ${input.absolutePath}` }
    }
    return {
      ok: true,
      repository: hit.repository,
      location: hit.location,
      absolutePath: AppFileSystem.resolve(input.absolutePath),
    }
  }

  const repositoryId = input.repositoryId ?? info.primaryRepositoryId
  const abs = resolveAbsolute(info, repositoryId, input.path)
  const hit = locate(info, abs)
  if (!hit || hit.repository.id !== repositoryId) {
    return { ok: false, code: "outside_root", message: `Path outside repository "${repositoryId}"` }
  }
  return { ok: true, repository: hit.repository, location: hit.location, absolutePath: abs }
}
