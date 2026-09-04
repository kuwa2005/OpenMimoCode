import type { Info } from "../schema"
import { detectEdges } from "./detect"
import type { RepositoryGraph } from "./types"

const cache = new Map<string, RepositoryGraph>()

export function graphFingerprint(info: Info): string {
  const parts = [...info.repositories.values()]
    .map((r) => `${r.id}:${r.git?.head ?? "nohead"}:${r.access}`)
    .sort()
  return `${info.configPath}|${info.primaryRepositoryId}|${parts.join(",")}`
}

export async function buildGraph(info: Info, opts?: { force?: boolean }): Promise<RepositoryGraph> {
  const fingerprint = graphFingerprint(info)
  if (!opts?.force) {
    const hit = cache.get(info.configPath)
    if (hit && hit.fingerprint === fingerprint) return hit
  }
  const edges = await detectEdges(info)
  const graph: RepositoryGraph = {
    workspaceName: info.name,
    primaryRepositoryId: info.primaryRepositoryId,
    fingerprint,
    generatedAt: new Date().toISOString(),
    edges,
  }
  cache.set(info.configPath, graph)
  return graph
}

export function invalidateGraphCache(configPath?: string) {
  if (configPath) {
    cache.delete(configPath)
    return
  }
  cache.clear()
}

export function formatGraph(graph: RepositoryGraph): string {
  const lines = [
    `Workspace: ${graph.workspaceName}`,
    `Primary: ${graph.primaryRepositoryId}`,
    `Fingerprint: ${graph.fingerprint}`,
    `Generated: ${graph.generatedAt}`,
    `Edges: ${graph.edges.length}`,
    "",
  ]
  if (!graph.edges.length) {
    lines.push("(no edges detected — declare path deps or OpenAPI/compose/docs links)")
    return lines.join("\n")
  }
  for (const e of graph.edges) {
    lines.push(`${e.from} -> ${e.to}  [${e.kind}]  ${e.confidence}/${e.source}`)
    for (const ev of e.evidence.slice(0, 3)) {
      lines.push(`  - ${ev.repositoryId}:${ev.path}${ev.line != null ? `:${ev.line}` : ""} — ${ev.description}`)
    }
  }
  return lines.join("\n")
}

/** Topological-ish order: schema/api producers before consumers when edges point consumer->producer. */
export function suggestedBuildOrder(graph: RepositoryGraph, repoIds: string[]): string[] {
  const set = new Set(repoIds)
  const producers = new Map<string, number>()
  for (const id of repoIds) producers.set(id, 0)
  for (const e of graph.edges) {
    if (!set.has(e.from) || !set.has(e.to)) continue
    // from depends on to → to should come first
    producers.set(e.to, (producers.get(e.to) ?? 0) + 1)
  }
  return [...repoIds].sort((a, b) => {
    const pa = producers.get(a) ?? 0
    const pb = producers.get(b) ?? 0
    if (pb !== pa) return pb - pa
    const rank = (id: string) => {
      if (/schema|contract|proto|openapi/i.test(id)) return 0
      if (/backend|api|server/i.test(id)) return 1
      if (/frontend|web|ui/i.test(id)) return 2
      if (/infra|deploy/i.test(id)) return 9
      return 5
    }
    return rank(a) - rank(b) || a.localeCompare(b)
  })
}
