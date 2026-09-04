// Consumes @local/shared-schema (see package.json file: dep)
export function renderUser(u: { id: string; displayName?: string }) {
  return u.displayName ?? u.id
}
