/** Cross-repository change tracking (oimo-internal; not a Git commit). */

export type ChangeSetStatus = "planned" | "approved" | "complete" | "partial" | "failed" | "cancelled"

export type ChangeSetFile = {
  repositoryId: string
  relativePath: string
  action: "create" | "modify" | "delete"
}

export type ChangeSetRepoResult = {
  repositoryId: string
  files: ChangeSetFile[]
  verification?: VerificationSummary
  error?: string
}

export type VerificationSummary = {
  commands: Array<{
    name: string
    command: string
    cwd: string
    status: "passed" | "failed" | "skipped" | "not_run"
    reason?: string
    exitCode?: number
  }>
}

export type CrossRepoPlan = {
  id: string
  title: string
  createdAt: string
  mustChange: Array<{ repositoryId: string; summary: string }>
  reviewOnly: Array<{ repositoryId: string; summary: string }>
  executionOrder: string[]
  graphFingerprint?: string
  approvedAt?: string
  approvedBy?: "user" | "auto"
}

export type ChangeSet = {
  id: string
  sessionID: string
  status: ChangeSetStatus
  plan: CrossRepoPlan
  executionScope: string[]
  repos: ChangeSetRepoResult[]
  createdAt: string
  updatedAt: string
}

export function createPlan(input: {
  title: string
  mustChange: CrossRepoPlan["mustChange"]
  reviewOnly: CrossRepoPlan["reviewOnly"]
  executionOrder: string[]
  graphFingerprint?: string
}): CrossRepoPlan {
  return {
    id: `plan-${Date.now()}`,
    title: input.title,
    createdAt: new Date().toISOString(),
    mustChange: input.mustChange,
    reviewOnly: input.reviewOnly,
    executionOrder: input.executionOrder,
    graphFingerprint: input.graphFingerprint,
  }
}

export function createChangeSet(input: {
  sessionID: string
  plan: CrossRepoPlan
  executionScope: string[]
}): ChangeSet {
  const now = new Date().toISOString()
  return {
    id: `cs-${Date.now()}`,
    sessionID: input.sessionID,
    status: input.plan.approvedAt ? "approved" : "planned",
    plan: input.plan,
    executionScope: [...input.executionScope],
    repos: input.executionScope.map((repositoryId) => ({ repositoryId, files: [] })),
    createdAt: now,
    updatedAt: now,
  }
}

export function approvePlan(plan: CrossRepoPlan, by: "user" | "auto"): CrossRepoPlan {
  return { ...plan, approvedAt: new Date().toISOString(), approvedBy: by }
}

export function recordFileChange(
  cs: ChangeSet,
  file: ChangeSetFile,
): ChangeSet {
  const repos = cs.repos.map((r) => {
    if (r.repositoryId !== file.repositoryId) return r
    const files = [...r.files.filter((f) => f.relativePath !== file.relativePath), file]
    return { ...r, files }
  })
  const hasRepo = repos.some((r) => r.repositoryId === file.repositoryId)
  return {
    ...cs,
    repos: hasRepo ? repos : [...repos, { repositoryId: file.repositoryId, files: [file] }],
    updatedAt: new Date().toISOString(),
  }
}

export function finalizeChangeSet(
  cs: ChangeSet,
  status: Extract<ChangeSetStatus, "complete" | "partial" | "failed" | "cancelled">,
): ChangeSet {
  return { ...cs, status, updatedAt: new Date().toISOString() }
}

export function formatPlan(plan: CrossRepoPlan): string {
  return [
    `Cross-repository change plan: ${plan.title}`,
    `id: ${plan.id}`,
    plan.approvedAt ? `approved: ${plan.approvedAt} (${plan.approvedBy})` : "approved: (pending)",
    "",
    "変更対象",
    ...plan.mustChange.map((m) => `- ${m.repositoryId}: ${m.summary}`),
    "",
    "確認のみ",
    ...(plan.reviewOnly.length
      ? plan.reviewOnly.map((m) => `- ${m.repositoryId}: ${m.summary}`)
      : ["- (none)"]),
    "",
    "実行順序",
    ...plan.executionOrder.map((id, i) => `${i + 1}. ${id}`),
  ].join("\n")
}

export function formatChangeSet(cs: ChangeSet): string {
  const lines = [
    `Change set ${cs.id}  status=${cs.status}`,
    `scope: ${cs.executionScope.join(", ")}`,
    "",
  ]
  for (const r of cs.repos) {
    lines.push(`## ${r.repositoryId}`)
    if (!r.files.length) lines.push("- (no files yet)")
    for (const f of r.files) lines.push(`- ${f.action} ${f.relativePath}`)
    if (r.verification) {
      for (const c of r.verification.commands) {
        lines.push(`  verify ${c.name}: ${c.status}${c.reason ? ` (${c.reason})` : ""}`)
      }
    }
    if (r.error) lines.push(`  error: ${r.error}`)
  }
  return lines.join("\n")
}

/** In-memory store keyed by session (persisted later via session fingerprint extension). */
const bySession = new Map<string, ChangeSet>()

export function saveChangeSet(cs: ChangeSet) {
  bySession.set(cs.sessionID, cs)
  return cs
}

export function loadChangeSet(sessionID: string) {
  return bySession.get(sessionID)
}

export function clearChangeSets() {
  bySession.clear()
}
