import type { FrictionMetrics } from "./metrics"
import type { ScenarioScore } from "./scenario"

export type EvalVerdict = "pass" | "fail" | "inconclusive"

export type ReplayComparison = {
  before: Partial<FrictionMetrics>
  after: Partial<FrictionMetrics>
  verdict: EvalVerdict
  notes: string[]
}

export type GateResult = {
  verdict: EvalVerdict
  friction?: ReplayComparison
  scenarios?: ScenarioScore[]
  notes: string[]
}

/** Compare two friction snapshots for evaluation-gate decisions. */
export function compareFriction(before: FrictionMetrics, after: FrictionMetrics): ReplayComparison {
  const notes: string[] = []
  let improved = 0
  let worsened = 0

  const pairs: Array<[string, number, number, boolean]> = [
    ["toolCalls", before.toolCalls, after.toolCalls, true],
    ["correctionHints", before.correctionHints, after.correctionHints, true],
    ["hacScore", before.humanAttentionCost.score, after.humanAttentionCost.score, true],
    ["userTurns", before.userTurns, after.userTurns, true],
  ]

  for (const [label, a, b, lowerBetter] of pairs) {
    if (a === 0 && b === 0) continue
    const delta = b - a
    if (delta === 0) {
      notes.push(`${label}: unchanged (${a})`)
      continue
    }
    const better = lowerBetter ? delta < 0 : delta > 0
    if (better) {
      improved++
      notes.push(`${label}: ${a} → ${b} (improved)`)
      continue
    }
    worsened++
    notes.push(`${label}: ${a} → ${b} (worsened)`)
  }

  const verdict: EvalVerdict =
    improved > 0 && worsened === 0 ? "pass" : worsened > improved ? "fail" : "inconclusive"

  return { before, after, verdict, notes }
}

export function formatEval(c: ReplayComparison): string {
  return [
    `# Evaluation gate: ${c.verdict}`,
    "",
    ...c.notes.map((n) => `- ${n}`),
    "",
    c.verdict === "pass"
      ? "Adopt candidate."
      : c.verdict === "fail"
        ? "Reject or rollback candidate."
        : "Needs more evidence / human judgment.",
  ].join("\n")
}

/** Combine friction compare + scenario fixture scores into one gate. */
export function combineGate(input: {
  friction?: ReplayComparison
  scenarios?: ScenarioScore[]
}): GateResult {
  const notes: string[] = []
  const scenarioFail = (input.scenarios ?? []).filter((s) => !s.pass)

  if (input.friction) notes.push(...input.friction.notes.map((n) => `friction: ${n}`))
  if (input.scenarios) {
    const pass = input.scenarios.filter((s) => s.pass).length
    notes.push(`scenarios: ${pass}/${input.scenarios.length} passed`)
    for (const s of scenarioFail) {
      notes.push(`scenario FAIL ${s.id}: ${s.failures.join("; ")}`)
    }
  }

  if (scenarioFail.length > 0) {
    return { verdict: "fail", friction: input.friction, scenarios: input.scenarios, notes }
  }
  if (input.friction?.verdict === "fail") {
    return { verdict: "fail", friction: input.friction, scenarios: input.scenarios, notes }
  }
  if (input.friction?.verdict === "pass") {
    return { verdict: "pass", friction: input.friction, scenarios: input.scenarios, notes }
  }
  if (input.scenarios?.length && scenarioFail.length === 0) {
    return { verdict: "pass", friction: input.friction, scenarios: input.scenarios, notes }
  }
  return { verdict: "inconclusive", friction: input.friction, scenarios: input.scenarios, notes }
}

export function formatGate(g: GateResult): string {
  return [
    `# Combined gate: ${g.verdict}`,
    "",
    ...g.notes.map((n) => `- ${n}`),
    "",
    g.verdict === "pass"
      ? "Safe to propose Human approval for adopt."
      : g.verdict === "fail"
        ? "Do not auto-apply; revise or rollback."
        : "Need human judgment or more scenario runs.",
  ].join("\n")
}
