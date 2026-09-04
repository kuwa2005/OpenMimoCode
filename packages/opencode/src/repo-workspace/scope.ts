/** Per-session execution scope for multi-repo writes. */

const scopes = new Map<string, Set<string>>()

export function setScope(sessionID: string, repositoryIds: string[]) {
  scopes.set(sessionID, new Set(repositoryIds))
}

export function clearScope(sessionID: string) {
  scopes.delete(sessionID)
}

export function getScope(sessionID: string): Set<string> | undefined {
  return scopes.get(sessionID)
}

export function clearAllScopes() {
  scopes.clear()
}
