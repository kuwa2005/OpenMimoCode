// Consumes @local/shared-schema (see package.json file: dep)
export function toDto(u: { id: string; displayName?: string }) {
  return { id: u.id, displayName: u.displayName ?? null }
}
