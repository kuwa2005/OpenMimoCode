import type { FrictionType, LearnedRule, Responsibility, RuleScope } from "./types"
import type { DetectedSignal } from "./detector"
import { ruleMentionsVerification } from "./detector"

export type Classification = {
  friction_type: FrictionType
  responsibility: Responsibility
  detected_gap: string
  root_cause: string
  scope: RuleScope
  confidence: number
  candidate_rule: string
  improved_instruction?: string
  instruction_suggestion?: string
  business_intent?: string
  se_notes?: string
  fde_notes?: string
  tags: string[]
}

const MOBILE_UI = /スマホ|モバイル|mobile|viewport|レスポンシブ|崩れて/i
const SIZE_ADJ = /大きく|小さく|余白|間隔|詰めて|サイズ/i
const CSV_EXCEL = /csv|excel|文字化け|経理/i
const PLAYWRIGHT = /playwright|実画面|ブラウザ確認|確認した/i

export function classify(input: {
  signal: DetectedSignal
  userFeedback: string
  originalInstruction?: string
  existingRules: LearnedRule[]
  modes: Array<"se" | "fde">
}): Classification {
  const feedback = input.userFeedback
  const original = input.originalInstruction ?? ""
  const hasVerifyRule = ruleMentionsVerification(input.existingRules)
  const se = input.modes.includes("se")
  const fde = input.modes.includes("fde")

  if (input.signal.kind === "temporary") {
    return {
      friction_type: "preference_discovery",
      responsibility: "user_instruction",
      detected_gap: "One-off preference (temporary / this-task-only)",
      root_cause: "User scoped the change to this task only",
      scope: "task",
      confidence: 0.4,
      candidate_rule: feedback.trim(),
      tags: ["temporary", "task-only"],
      se_notes: se ? "Do not promote temporary preference to project/general rules." : undefined,
      fde_notes: fde ? "Treat as field one-off; do not change standing operating procedure." : undefined,
    }
  }

  if (input.signal.kind === "disable_rule") {
    return {
      friction_type: "rule_correction",
      responsibility: "user_correction",
      detected_gap: "User rejected a previously learned rule",
      root_cause: "Learned rule overfit or no longer desired",
      scope: "session",
      confidence: 0.9,
      candidate_rule: "Disable or lower confidence of matching learned rules",
      tags: ["disable", "correction"],
    }
  }

  if (input.signal.kind === "repeat_adjustment" || (SIZE_ADJ.test(feedback) && SIZE_ADJ.test(original))) {
    return {
      friction_type: "interpretation_gap",
      responsibility: "agent_interpretation",
      detected_gap: "Abstract magnitude request was under-adjusted relative to user expectation",
      root_cause: "Agent interpreted qualitative size/spacing change too conservatively",
      scope: "project",
      confidence: 0.55,
      candidate_rule: "抽象的なサイズ・余白変更要求では、実画面の視認性まで確認してから完了とする",
      improved_instruction: "サイズ変更時は実画面で『まだ小さい/大きい』が出ないまで調整し、Desktop/Mobile双方を確認する",
      instruction_suggestion:
        "次回は『現在より十分大きく、PC/スマホ双方で視認性を確認し、間延び/窮屈感がなくなるまで調整する』まで指定してもらえると初回で近づけます",
      tags: ["ui", "interpretation", "size"],
      se_notes: se ? "Verification should include visual check after size tweaks." : undefined,
    }
  }

  if (
    (input.signal.kind === "bug_report" || input.signal.kind === "verification_ask" || MOBILE_UI.test(feedback)) &&
    hasVerifyRule
  ) {
    return {
      friction_type: "verification_gap",
      responsibility: "agent_verification",
      detected_gap: "Existing project rule required verification that was not performed",
      root_cause: "Agent skipped known verification obligation",
      scope: "project",
      confidence: 0.85,
      candidate_rule: "UI変更後は対象viewportで表示確認を行う（既存ルールの再強化）",
      tags: ["ui", "verification", "mobile"],
      se_notes: se ? "This is agent verification failure, not user instruction gap." : undefined,
    }
  }

  if (input.signal.kind === "verification_ask" || PLAYWRIGHT.test(feedback)) {
    return {
      friction_type: "verification_gap",
      responsibility: hasVerifyRule ? "agent_verification" : "shared_ambiguity",
      detected_gap: "Post-implementation verification was missing or unproven",
      root_cause: hasVerifyRule
        ? "Agent failed to follow verification rule"
        : "Verification expectation was not explicit in the original ask",
      scope: "project",
      confidence: 0.7,
      candidate_rule: "UI/機能変更後は指定された検証手段（例: Playwright / 実画面）まで完了条件に含める",
      tags: ["verification"],
      se_notes: se ? "Add verification evidence before claiming done." : undefined,
    }
  }

  if (MOBILE_UI.test(feedback) && !MOBILE_UI.test(original) && !hasVerifyRule) {
    return {
      friction_type: /崩れて/.test(feedback) ? "requirement_discovery" : "instruction_gap",
      responsibility: "shared_ambiguity",
      detected_gap: "Mobile / responsive verification was not in the original instruction",
      root_cause: "Responsive check emerged after first delivery",
      scope: "project",
      confidence: 0.6,
      candidate_rule: "UI変更時はDesktop/Mobile双方で表示確認する",
      improved_instruction: "UI変更後はPC/スマホ双方で表示確認することを完了条件に含める",
      instruction_suggestion:
        "次回は『カード間隔を狭くし、PC/スマホ双方で表示確認し、間延び感がなくなるまで調整する』まで指定してもらえると初回で近づけます",
      tags: ["ui", "mobile", "responsive"],
      se_notes: se ? "Missing responsive verification criteria." : undefined,
      fde_notes: fde ? "Users often validate on the device they actually use (often phone)." : undefined,
    }
  }

  if (CSV_EXCEL.test(feedback) || (CSV_EXCEL.test(original) && input.signal.kind !== "none")) {
    return {
      friction_type: "requirement_discovery",
      responsibility: "shared_ambiguity",
      detected_gap: "Business consumer of the output (Excel / accounting) was underspecified",
      root_cause: "Output encoding and consumer tool constraints surfaced after delivery",
      scope: "project",
      confidence: 0.65,
      candidate_rule: "帳票・CSV出力では利用者と利用ソフト（例: Excel）を確認し、文字化けしない形式で出す",
      business_intent: "経理担当などがExcelで処理できる出力を得る",
      tags: ["csv", "excel", "encoding", "business"],
      fde_notes: fde
        ? "Ask who consumes the file and with what software before implementing export features."
        : undefined,
      se_notes: se ? "Include encoding / BOM / locale in export acceptance criteria." : undefined,
    }
  }

  if (input.signal.kind === "revert") {
    return {
      friction_type: "preference_discovery",
      responsibility: "agent_interpretation",
      detected_gap: "Delivered change diverged from preferred prior state",
      root_cause: "Interpretation of desired direction mismatched user taste",
      scope: "session",
      confidence: 0.5,
      candidate_rule: "大きなUI方向転換の前に差分プレビューまたは確認を挟む",
      tags: ["revert", "preference"],
    }
  }

  if (input.signal.kind === "rejection") {
    return {
      friction_type: "interpretation_gap",
      responsibility: "agent_interpretation",
      detected_gap: "Agent interpretation did not match user intent",
      root_cause: "Ambiguous request led to wrong interpretation",
      scope: "session",
      confidence: 0.55,
      candidate_rule: "否定フィードバック後は解釈を言い直し、確認してから再実装する",
      tags: ["rejection", "interpretation"],
    }
  }

  if (input.signal.kind === "bug_report") {
    return {
      friction_type: "implementation_gap",
      responsibility: "agent_implementation",
      detected_gap: "Implementation did not meet expected behavior in the reported environment",
      root_cause: "Incomplete implementation or missing edge-case handling",
      scope: "project",
      confidence: 0.55,
      candidate_rule: "報告された環境・再現手順を完了条件に含めてから完了とする",
      tags: ["bug", "implementation"],
      se_notes: se ? "Reproduce, fix, and re-verify in the reported environment." : undefined,
    }
  }

  if (input.signal.kind === "added_constraint") {
    return {
      friction_type: "instruction_gap",
      responsibility: "user_instruction",
      detected_gap: "Additional constraint arrived after the first instruction",
      root_cause: "Original instruction omitted a constraint the user later stated",
      scope: "project",
      confidence: 0.5,
      candidate_rule: summarizeConstraintRule(feedback),
      tags: ["added-constraint"],
    }
  }

  if (input.signal.kind === "manual_fix_hint") {
    return {
      friction_type: "implementation_gap",
      responsibility: "agent_implementation",
      detected_gap: "User had to manually correct agent output",
      root_cause: "Agent output quality fell short of user standard",
      scope: "user",
      confidence: 0.45,
      candidate_rule: "ユーザーが手動修正した差分パターンを次回の完了条件に反映する",
      tags: ["manual-fix"],
    }
  }

  return {
    friction_type: "context_gap",
    responsibility: "missing_context",
    detected_gap: "Feedback indicates unmet expectation without a clear single gap class",
    root_cause: "Insufficient shared context between user and agent",
    scope: "session",
    confidence: 0.35,
    candidate_rule: "類似タスクでは前回のフィードバック条件を暗黙の完了条件として確認する",
    tags: ["context"],
  }
}

function summarizeConstraintRule(feedback: string): string {
  if (/外部ライブラリ|使わない/.test(feedback)) return "依存追加前に外部ライブラリ可否を確認する"
  if (/バリデーション/.test(feedback)) return "フォーム実装時はバリデーションを初期完了条件に含める"
  if (MOBILE_UI.test(feedback)) return "UI変更時はDesktop/Mobile双方で表示確認する"
  return `後出し条件を次回の類似タスク完了条件に含める: ${feedback.slice(0, 80)}`
}
