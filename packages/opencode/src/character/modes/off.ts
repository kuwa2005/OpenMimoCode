import type { StructuredFriction } from "@/friction/types"

/** Neutral presentation — learning still runs; no persona/emotion. */
export function renderOff(f: StructuredFriction): string {
  if (f.friction_type === "rule_correction") {
    return [
      "Rule correction detected.",
      `Action: disable or lower confidence`,
      f.disable_rule_ids?.length ? `Disabled: ${f.disable_rule_ids.join(", ")}` : `Candidate: ${f.candidate_rule}`,
    ].join("\n")
  }

  return [
    "追加要件または摩擦を検出しました。",
    "",
    `分類: ${labelType(f.friction_type)}`,
    `責任: ${f.responsibility}`,
    `追加/検出: ${f.detected_gap}`,
    `適用範囲: ${f.scope}`,
    `今後: ${f.candidate_rule}`,
    f.business_intent ? `業務意図: ${f.business_intent}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function labelType(t: StructuredFriction["friction_type"]): string {
  const map: Record<StructuredFriction["friction_type"], string> = {
    instruction_gap: "Instruction Gap",
    interpretation_gap: "Interpretation Gap",
    implementation_gap: "Implementation Gap",
    verification_gap: "Verification Gap",
    context_gap: "Context Gap",
    requirement_discovery: "Requirement Discovery",
    preference_discovery: "Preference Discovery",
    rule_correction: "Rule Correction",
  }
  return map[t]
}
