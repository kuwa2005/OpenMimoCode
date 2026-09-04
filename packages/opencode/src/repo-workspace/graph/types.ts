export type EdgeKind = "build" | "runtime" | "api" | "schema" | "event" | "deploy" | "docs" | "unknown"

export type EdgeConfidence = "confirmed" | "high" | "medium" | "low"

export type EdgeSource = "declared" | "detected" | "user"

export type EdgeEvidence = {
  repositoryId: string
  path: string
  line?: number
  description: string
}

export type RepositoryEdge = {
  from: string
  to: string
  kind: EdgeKind
  evidence: EdgeEvidence[]
  confidence: EdgeConfidence
  source: EdgeSource
}

export type RepositoryGraph = {
  workspaceName: string
  primaryRepositoryId: string
  /** Fingerprint of repo HEADs + config path; invalidate when this changes. */
  fingerprint: string
  generatedAt: string
  edges: RepositoryEdge[]
  /** Repos mentioned only via docs/ADR with low confidence. */
  notes?: string[]
}

export type ImpactClass = "must_change" | "review" | "no_impact" | "unknown"

export type ImpactCategory = "production" | "test" | "generated" | "docs" | "infra"

export type ImpactItem = {
  repositoryId: string
  relativePath?: string
  classification: ImpactClass
  category: ImpactCategory
  reason: string
  evidence: EdgeEvidence[]
}

export type ImpactReport = {
  seed: { repositoryId?: string; query: string }
  graphFingerprint: string
  items: ImpactItem[]
  executionOrder: string[]
  stale: boolean
}
