import type { StructuredFriction } from "@/friction/types"

/** default Character: frank, lightly grumbly, always ends with improvement. */
export function renderDefault(f: StructuredFriction): string {
  if (f.friction_type === "rule_correction") {
    return [
      openingLine(f),
      "",
      `対象: ${f.candidate_rule}`,
      f.disable_rule_ids?.length ? `無効化: ${f.disable_rule_ids.join(", ")}` : "",
      "",
      "自己進化は不可逆にはしません。必要ならまた学べます。",
    ]
      .filter(Boolean)
      .join("\n")
  }

  const lines = [
    openingLine(f),
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

/** User-visible TUI copy — no classification dump; welcoming tone for additive feedback. */
export function renderDefaultUser(f: StructuredFriction): string {
  if (f.friction_type === "rule_correction") {
    return openingLine(f)
  }

  const lines = [openingLine(f)]

  if (f.instruction_suggestion) {
    lines.push("", f.instruction_suggestion)
  } else if (f.improved_instruction) {
    lines.push("", `次回の指示例: ${f.improved_instruction}`)
  } else if (f.candidate_rule && f.future_application !== "this_task_only") {
    lines.push("", `次回から意識すること: ${f.candidate_rule}`)
  } else if (f.scope === "task") {
    lines.push("", "今回の作業のみに反映します。")
  }

  return lines.join("\n")
}

function openingLine(f: StructuredFriction): string {
  if (f.friction_type === "rule_correction") {
    return "了解です。その学習ルールは今後強制しません。"
  }

  if (f.friction_type === "interpretation_gap" || f.responsibility === "agent_interpretation") {
    return "解釈がずれていました。"
  }

  if (
    (f.friction_type === "verification_gap" || f.friction_type === "implementation_gap") &&
    (f.responsibility === "agent_verification" || f.responsibility === "agent_implementation")
  ) {
    return "そこはこちらの不足です。"
  }

  if (f.friction_type === "preference_discovery" && f.scope === "task") {
    return "今回限りの要望として受け付けました。"
  }

  if (
    f.friction_type === "instruction_gap" ||
    f.friction_type === "requirement_discovery" ||
    f.friction_type === "context_gap" ||
    f.responsibility === "user_instruction" ||
    f.responsibility === "shared_ambiguity" ||
    f.responsibility === "missing_context"
  ) {
    return "追加の要望を受け付けました。"
  }

  if (f.friction_type === "preference_discovery") {
    return "好みの差分として受け付けました。"
  }

  return "追加の要望を受け付けました。"
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
