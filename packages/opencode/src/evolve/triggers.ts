import type { ProjectID } from "@/project/schema"
import { collectFrictionMetrics } from "./metrics"
import { Database } from "@/storage"

export type EvolveTriggerReason =
  | { kind: "interval" }
  | { kind: "hac_high"; score: number }
  | { kind: "corrections"; count: number }
  | { kind: "read_replay"; count: number }
  | { kind: "tool_churn"; count: number }
  | { kind: "error_clusters"; count: number }

export type TriggerDecision = {
  fire: boolean
  reasons: EvolveTriggerReason[]
}

/** Condition-based evolve triggers (instruction §22), independent of interval. */
export function evaluateConditionTriggers(input: {
  projectID: ProjectID
  windowDays?: number
}): TriggerDecision {
  const metrics = collectFrictionMetrics({
    projectID: input.projectID,
    windowDays: input.windowDays ?? 7,
  })
  const reasons: EvolveTriggerReason[] = []

  if (metrics.humanAttentionCost.level === "high") {
    reasons.push({ kind: "hac_high", score: metrics.humanAttentionCost.score })
  }
  if (metrics.correctionHints >= 3) {
    reasons.push({ kind: "corrections", count: metrics.correctionHints })
  }
  const replay = metrics.readReplays.reduce((s, r) => s + r.n, 0)
  if (replay >= 15) {
    reasons.push({ kind: "read_replay", count: replay })
  }
  if (metrics.toolCalls >= 250) {
    reasons.push({ kind: "tool_churn", count: metrics.toolCalls })
  }

  const errorClusters =
    (
      Database.Client()
        .$client.query(
          `SELECT count(*) as n FROM (
             SELECT substr(coalesce(json_extract(p.data, '$.state.error'), json_extract(p.data, '$.state.output')), 1, 120) as preview,
                    count(*) as c
             FROM part p
             JOIN message m ON m.id = p.message_id
             JOIN session s ON s.id = m.session_id
             WHERE s.project_id = ?
               AND m.time_created > ?
               AND json_extract(p.data, '$.type') = 'tool'
             GROUP BY preview
             HAVING c >= 3
           )`,
        )
        .all(input.projectID, metrics.cutoffMs) as Array<{ n: number }>
    ).at(0)?.n ?? 0

  if (errorClusters >= 3) {
    reasons.push({ kind: "error_clusters", count: errorClusters })
  }

  return { fire: reasons.length > 0, reasons }
}
