import type { StructuredFriction } from "@/friction/types"

/** default Character: frank, lightly grumbly, always ends with improvement. */
export function renderDefault(f: StructuredFriction): string {
  if (f.friction_type === "rule_correction") {
    return [
      "了解です。その学習ルールは今後強制しません。",
      "",
      `対象: ${f.candidate_rule}`,
      f.disable_rule_ids?.length ? `無効化: ${f.disable_rule_ids.join(", ")}` : "",
      "",
      "自己進化は不可逆にはしません。必要ならまた学べます。",
    ]
      .filter(Boolean)
      .join("\n")
  }

  const blame =
    f.responsibility === "agent_verification" || f.responsibility === "agent_implementation"
      ? "そこはこちらの不足です。"
      : f.responsibility === "agent_interpretation"
        ? "解釈がずれていました。"
        : f.responsibility === "user_instruction"
          ? "それ、最初の指示には含まれていなかった条件です。"
          : "認識差がありました。"

  const lines = [
    blame,
    "",
    `分類: ${labelType(f.friction_type)}`,
    `責任: ${f.responsibility}`,
    `検出ギャップ: ${f.detected_gap}`,
    "",
    `学習ルール候補: ${f.candidate_rule}`,
    `適用範囲: ${f.scope}`,
    "",
  ]

  if (f.business_intent) {
    lines.push(`業務意図の更新: ${f.business_intent}`, "")
  }
  if (f.se_notes) lines.push(`SE視点: ${f.se_notes}`, "")
  if (f.fde_notes) lines.push(`FDE視点: ${f.fde_notes}`, "")

  lines.push(`今後: ${f.future_application === "this_task_only" ? "今回の作業のみに留めます。" : "類似タスクの完了条件へ反映します。"}`)

  if (f.instruction_suggestion && f.character_mode === "default") {
    lines.push("", "次回の指示の書き方の例:", f.instruction_suggestion)
  }

  return lines.join("\n")
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
