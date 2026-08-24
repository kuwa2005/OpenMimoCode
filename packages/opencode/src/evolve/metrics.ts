import { Database } from "@/storage"
import type { ProjectID } from "@/project/schema"

export type FrictionMetrics = {
  windowDays: number
  cutoffMs: number
  sessions: number
  userTurns: number
  assistantTurns: number
  toolCalls: number
  toolByName: Array<{ tool: string; n: number }>
  readReplays: Array<{ preview: string; n: number }>
  correctionHints: number
  humanAttentionCost: {
    score: number
    level: "low" | "medium" | "high"
    drivers: string[]
  }
}

const CORRECTION_RE =
  /\b(wrong|again|already|i said|not what|incorrect|revert|undo)\b|違う|また|すでに|言っ|やり直し|戻して|違うよ/i

function q<T>(sql: string, ...params: unknown[]): T[] {
  return Database.Client().$client.query(sql).all(...(params as never[])) as T[]
}

export function collectFrictionMetrics(input: {
  projectID: ProjectID
  windowDays?: number
}): FrictionMetrics {
  const windowDays = input.windowDays ?? 14
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000

  const sessions =
    q<{ n: number }>(
      `SELECT count(*) as n FROM session
       WHERE project_id = ? AND parent_id IS NULL AND time_created > ?`,
      input.projectID,
      cutoffMs,
    ).at(0)?.n ?? 0

  const roleCounts = q<{ role: string; n: number }>(
    `SELECT json_extract(m.data, '$.role') as role, count(*) as n
     FROM message m
     JOIN session s ON s.id = m.session_id
     WHERE s.project_id = ? AND m.time_created > ?
     GROUP BY role`,
    input.projectID,
    cutoffMs,
  )

  const toolByName = q<{ tool: string; n: number }>(
    `SELECT json_extract(p.data, '$.tool') as tool, count(*) as n
     FROM part p
     JOIN message m ON m.id = p.message_id
     JOIN session s ON s.id = m.session_id
     WHERE s.project_id = ?
       AND m.time_created > ?
       AND json_extract(p.data, '$.type') = 'tool'
       AND json_extract(p.data, '$.tool') IS NOT NULL
     GROUP BY tool
     ORDER BY n DESC
     LIMIT 40`,
    input.projectID,
    cutoffMs,
  )

  const readReplays = q<{ preview: string; n: number }>(
    `SELECT substr(json_extract(p.data, '$.state.input'), 1, 160) as preview, count(*) as n
     FROM part p
     JOIN message m ON m.id = p.message_id
     JOIN session s ON s.id = m.session_id
     WHERE s.project_id = ?
       AND m.time_created > ?
       AND json_extract(p.data, '$.tool') = 'read'
     GROUP BY preview
     HAVING n >= 3
     ORDER BY n DESC
     LIMIT 20`,
    input.projectID,
    cutoffMs,
  )

  const userTexts = q<{ text: string }>(
    `SELECT coalesce(json_extract(p.data, '$.text'), '') as text
     FROM part p
     JOIN message m ON m.id = p.message_id
     JOIN session s ON s.id = m.session_id
     WHERE s.project_id = ?
       AND m.time_created > ?
       AND json_extract(m.data, '$.role') = 'user'
       AND json_extract(p.data, '$.type') = 'text'`,
    input.projectID,
    cutoffMs,
  )

  const correctionHints = userTexts.filter((row) => CORRECTION_RE.test(row.text)).length
  const userTurns = roleCounts.find((r) => r.role === "user")?.n ?? 0
  const assistantTurns = roleCounts.find((r) => r.role === "assistant")?.n ?? 0
  const toolCalls = toolByName.reduce((sum, row) => sum + row.n, 0)
  const readReplayTotal = readReplays.reduce((sum, row) => sum + row.n, 0)

  const drivers: string[] = []
  let score = 0
  if (correctionHints >= 3) {
    score += correctionHints * 2
    drivers.push(`user corrections≈${correctionHints}`)
  }
  if (readReplayTotal >= 10) {
    score += Math.min(40, readReplayTotal)
    drivers.push(`same-file re-reads≈${readReplayTotal}`)
  }
  if (userTurns > 0 && assistantTurns / Math.max(1, userTurns) > 4) {
    score += 15
    drivers.push("high assistant/user turn ratio")
  }
  if (toolCalls > 200) {
    score += 10
    drivers.push(`tool churn=${toolCalls}`)
  }

  const level = score >= 40 ? "high" : score >= 15 ? "medium" : "low"

  return {
    windowDays,
    cutoffMs,
    sessions,
    userTurns,
    assistantTurns,
    toolCalls,
    toolByName,
    readReplays,
    correctionHints,
    humanAttentionCost: { score, level, drivers },
  }
}

export function formatFrictionMetrics(m: FrictionMetrics): string {
  const lines = [
    `# Friction metrics (last ${m.windowDays}d)`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Sessions | ${m.sessions} |`,
    `| User turns | ${m.userTurns} |`,
    `| Assistant turns | ${m.assistantTurns} |`,
    `| Tool calls | ${m.toolCalls} |`,
    `| Correction hints | ${m.correctionHints} |`,
    `| HAC score | ${m.humanAttentionCost.score} (${m.humanAttentionCost.level}) |`,
    "",
    "## HAC drivers",
    ...(m.humanAttentionCost.drivers.length
      ? m.humanAttentionCost.drivers.map((d) => `- ${d}`)
      : ["- (none notable)"]),
    "",
    "## Top tools",
    ...m.toolByName.slice(0, 15).map((t) => `- ${t.tool}: ${t.n}`),
    "",
    "## Same-file re-reads (n≥3)",
    ...(m.readReplays.length
      ? m.readReplays.slice(0, 10).map((r) => `- n=${r.n} ${r.preview.replace(/\s+/g, " ").slice(0, 100)}`)
      : ["- (none)"]),
  ]
  return lines.join("\n")
}
