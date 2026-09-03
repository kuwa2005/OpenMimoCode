import type { LearnedRule } from "./types"

/**
 * Rules with enough repeated Friction evidence become evolve candidates.
 * Friction never rewrites product code by itself — evolve reviews these later.
 */
export function evolveCandidatesFromRules(rules: LearnedRule[]): LearnedRule[] {
  return rules.filter(
    (r) =>
      r.status !== "disabled" &&
      r.scope !== "task" &&
      r.scope !== "session" &&
      (r.observations >= 3 || r.status === "reinforced" || r.status === "trusted"),
  )
}

export function formatEvolveCandidates(rules: LearnedRule[]): string {
  const list = evolveCandidatesFromRules(rules)
  if (!list.length) return "No Friction→Evolve candidates yet (need repeated evidence)."
  return [
    "# Friction → Evolve candidates",
    "",
    ...list.map(
      (r) =>
        `- [${r.status}] obs=${r.observations} c=${r.confidence.toFixed(2)} scope=${r.scope}: ${r.text}`,
    ),
  ].join("\n")
}
