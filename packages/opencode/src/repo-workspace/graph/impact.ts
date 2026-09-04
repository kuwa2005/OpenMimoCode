import type { Info } from "../schema"
import { buildGraph, graphFingerprint, suggestedBuildOrder } from "./build"
import type { ImpactCategory, ImpactClass, ImpactItem, ImpactReport, RepositoryGraph } from "./types"

/**
 * Cross-repository impact report from a seed query (API path, symbol, file, OpenAPI field).
 * Never treats low-confidence docs edges as must_change.
 */
export async function analyzeImpact(
  info: Info,
  input: {
    query: string
    seedRepositoryId?: string
    /** Previously generated graph; stale if fingerprint mismatches. */
    graph?: RepositoryGraph
  },
): Promise<ImpactReport> {
  const currentFp = graphFingerprint(info)
  const stale = Boolean(input.graph && input.graph.fingerprint !== currentFp)
  const graph = stale || !input.graph ? await buildGraph(info, { force: stale }) : input.graph

  const q = input.query.trim().toLowerCase()
  const items: ImpactItem[] = []
  const touched = new Set<string>()

  for (const repo of info.repositories.values()) {
    const id = repo.id
    const related = graph.edges.filter((e) => e.from === id || e.to === id)
    const strong = related.filter((e) => e.confidence === "confirmed" || e.confidence === "high")
    const queryHit = related.some((e) =>
      e.evidence.some(
        (ev) =>
          ev.path.toLowerCase().includes(q) ||
          ev.description.toLowerCase().includes(q) ||
          q.includes(id.toLowerCase()),
      ),
    )
    const openApiSeed =
      /openapi|schema|displayname|api\//i.test(input.query) &&
      (id === "shared-schema" || related.some((e) => e.kind === "api" || e.kind === "schema"))

    let classification: ImpactClass = "unknown"
    let category: ImpactCategory = categoryOf(id, repo.role)
    let reason = "No strong graph evidence for this seed"

    if (input.seedRepositoryId === id || (openApiSeed && id === "shared-schema")) {
      classification = "must_change"
      reason = "Seed / contract source repository"
      touched.add(id)
    } else if (repo.access === "read-only" && (category === "infra" || id === "infra")) {
      classification = strong.some((e) => e.kind === "deploy" && queryHit) ? "review" : "no_impact"
      reason =
        classification === "review"
          ? "Read-only infra mentioned in deploy edges — confirm only"
          : "Infra registered read-only; no matching deploy evidence for this change"
      category = "infra"
      touched.add(id)
    } else if (
      strong.some(
        (e) =>
          (e.kind === "api" || e.kind === "schema" || e.kind === "build" || e.kind === "runtime") &&
          (e.to === "shared-schema" || e.from === "shared-schema" || queryHit || openApiSeed),
      )
    ) {
      classification = "must_change"
      reason = "High/confirmed dependency on contract or seed-related edge"
      touched.add(id)
    } else if (related.some((e) => e.confidence === "medium" && (queryHit || openApiSeed))) {
      classification = "review"
      reason = "Medium-confidence edge; confirm before editing"
      touched.add(id)
    } else if (related.some((e) => e.kind === "docs" && e.confidence === "low")) {
      classification = "review"
      reason = "Docs mention only (low confidence) — not treated as fact"
      category = "docs"
    } else {
      classification = "no_impact"
      reason = "No matching edges for this seed"
    }

    items.push({
      repositoryId: id,
      classification,
      category,
      reason,
      evidence: related.flatMap((e) => e.evidence).slice(0, 5),
    })
  }

  const must = items.filter((i) => i.classification === "must_change").map((i) => i.repositoryId)
  const review = items.filter((i) => i.classification === "review").map((i) => i.repositoryId)
  const executionOrder = suggestedBuildOrder(graph, [...new Set([...must, ...review])])

  return {
    seed: { repositoryId: input.seedRepositoryId, query: input.query },
    graphFingerprint: graph.fingerprint,
    items,
    executionOrder,
    stale,
  }
}

export function formatImpact(report: ImpactReport): string {
  const lines = [
    `Impact seed: ${report.seed.query}${report.seed.repositoryId ? ` (repo=${report.seed.repositoryId})` : ""}`,
    `Graph fingerprint: ${report.graphFingerprint}${report.stale ? " (was stale — rebuilt)" : ""}`,
    "",
    "変更対象 (must_change)",
    ...report.items
      .filter((i) => i.classification === "must_change")
      .map((i) => `- ${i.repositoryId} [${i.category}]: ${i.reason}`),
    "",
    "確認のみ (review)",
    ...report.items
      .filter((i) => i.classification === "review")
      .map((i) => `- ${i.repositoryId} [${i.category}]: ${i.reason}`),
    "",
    "影響なし / 判断不能",
    ...report.items
      .filter((i) => i.classification === "no_impact" || i.classification === "unknown")
      .map((i) => `- ${i.repositoryId}: ${i.classification} — ${i.reason}`),
    "",
    "実行順序",
    ...report.executionOrder.map((id, i) => `${i + 1}. ${id}`),
  ]
  return lines.join("\n")
}

function categoryOf(id: string, role?: string): ImpactCategory {
  const s = `${id} ${role ?? ""}`.toLowerCase()
  if (/infra|deploy|terraform|k8s/.test(s)) return "infra"
  if (/test|spec|e2e/.test(s)) return "test"
  if (/generated|codegen/.test(s)) return "generated"
  if (/doc|readme|adr|note/.test(s)) return "docs"
  return "production"
}
