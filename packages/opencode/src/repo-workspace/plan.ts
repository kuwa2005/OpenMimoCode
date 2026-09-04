import type { Info } from "./schema"
import type { ImpactReport } from "./graph/types"
import { approvePlan, createChangeSet, createPlan, formatPlan, type ChangeSet, type CrossRepoPlan } from "./change-set"

/**
 * Build a cross-repo plan from an impact report.
 * Multi-repo writes require this plan when defaults.requireCrossRepoPlan is true.
 */
export function planFromImpact(input: {
  title: string
  impact: ImpactReport
}): CrossRepoPlan {
  const mustChange = input.impact.items
    .filter((i) => i.classification === "must_change")
    .map((i) => ({ repositoryId: i.repositoryId, summary: i.reason }))
  const reviewOnly = input.impact.items
    .filter((i) => i.classification === "review")
    .map((i) => ({ repositoryId: i.repositoryId, summary: i.reason }))
  return createPlan({
    title: input.title,
    mustChange,
    reviewOnly,
    executionOrder: input.impact.executionOrder,
    graphFingerprint: input.impact.graphFingerprint,
  })
}

export function executionScopeFromPlan(plan: CrossRepoPlan, info: Info): string[] {
  const ids = plan.mustChange.map((m) => m.repositoryId)
  return ids.filter((id) => {
    const repo = info.repositories.get(id)
    return repo && repo.access === "read-write"
  })
}

export function assertWritableInScope(input: {
  info: Info
  scope: Set<string> | string[]
  repositoryId: string
}): { ok: true } | { ok: false; reason: string } {
  const scope = input.scope instanceof Set ? input.scope : new Set(input.scope)
  if (!scope.has(input.repositoryId)) {
    return { ok: false, reason: `Repository "${input.repositoryId}" is outside execution scope` }
  }
  const repo = input.info.repositories.get(input.repositoryId)
  if (!repo) return { ok: false, reason: `Unknown repository "${input.repositoryId}"` }
  if (repo.access === "read-only") {
    return { ok: false, reason: `Repository "${input.repositoryId}" is read-only` }
  }
  return { ok: true }
}

export function beginChangeSet(input: {
  sessionID: string
  info: Info
  plan: CrossRepoPlan
  autoApprove?: boolean
}): { plan: CrossRepoPlan; changeSet: ChangeSet; logLine: string } {
  const plan = input.autoApprove ? approvePlan(input.plan, "auto") : input.plan
  const scope = executionScopeFromPlan(plan, input.info)
  const changeSet = createChangeSet({
    sessionID: input.sessionID,
    plan,
    executionScope: scope,
  })
  const logLine = [
    input.autoApprove ? "[auto] approved cross-repo plan" : "[pending] cross-repo plan",
    formatPlan(plan),
  ].join("\n")
  return { plan, changeSet, logLine }
}

export function requiresPlan(info: Info, targetRepoIds: string[]): boolean {
  if (!info.defaults.requireCrossRepoPlan) return false
  const writableTargets = targetRepoIds.filter((id) => {
    const r = info.repositories.get(id)
    return r && r.access === "read-write" && id !== info.primaryRepositoryId
  })
  return writableTargets.length > 0 || targetRepoIds.filter((id) => id !== info.primaryRepositoryId).length > 1
}
