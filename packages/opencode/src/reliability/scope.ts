import path from "path"
import { minimatch } from "minimatch"
import * as ConfigReliability from "@/config/reliability"
import { RecoverableError } from "@/tool/recoverable"

export type Scope = {
  allow: string[]
  deny: string[]
}

/** Default protected paths — secrets and credential material. */
export const DEFAULT_DENY = [".env", ".env.*", "**/.env", "**/.env.*", "**/credentials.json", "**/*secret*"]

const sessions = new Map<string, Scope>()

export function get(sessionID: string): Scope | undefined {
  return sessions.get(sessionID)
}

export function set(sessionID: string, scope: Scope) {
  sessions.set(sessionID, {
    allow: [...scope.allow],
    deny: [...scope.deny],
  })
  return get(sessionID)!
}

export function clear(sessionID: string) {
  sessions.delete(sessionID)
}

export function resetAll() {
  sessions.clear()
}

export function relativeToWorktree(filepath: string, worktree: string) {
  const full = path.resolve(filepath)
  const root = path.resolve(worktree)
  const rel = path.relative(root, full)
  if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined
  return rel.split(path.sep).join("/")
}

function matches(rel: string, patterns: readonly string[]) {
  return patterns.some((pattern) => minimatch(rel, pattern, { dot: true, matchBase: true }))
}

export function resolve(
  sessionID: string,
  cfg: { reliability?: ConfigReliability.Info },
): Scope {
  const session = sessions.get(sessionID)
  const allow = [...(cfg.reliability?.allow_globs ?? []), ...(session?.allow ?? [])]
  const deny = [
    ...DEFAULT_DENY,
    ...(cfg.reliability?.deny_globs ?? []),
    ...(session?.deny ?? []),
  ]
  return { allow: [...new Set(allow)], deny: [...new Set(deny)] }
}

/**
 * Returns an error message when the write is out of scope, otherwise undefined.
 * Memory / app-managed paths should be filtered by the caller before invoking.
 */
export function checkWrite(
  filepath: string,
  input: {
    sessionID: string
    worktree: string
    cfg: { reliability?: ConfigReliability.Info }
  },
): string | undefined {
  if (!ConfigReliability.feature(input.cfg, "scope")) return
  const rel = relativeToWorktree(filepath, input.worktree)
  if (!rel) return

  const scope = resolve(input.sessionID, input.cfg)
  if (matches(rel, scope.deny)) {
    return `Edit scope denied write to "${rel}" (matches deny glob). Adjust deny_globs / edit_scope or pick another path.`
  }
  if (scope.allow.length > 0 && !matches(rel, scope.allow)) {
    return `Edit scope denied write to "${rel}" (outside allow_globs: ${scope.allow.join(", ")}). Call edit_scope or widen allow_globs.`
  }
}

export function assertWrite(
  filepath: string,
  input: {
    sessionID: string
    worktree: string
    cfg: { reliability?: ConfigReliability.Info }
  },
) {
  const message = checkWrite(filepath, input)
  if (message) throw new RecoverableError(message)
}
