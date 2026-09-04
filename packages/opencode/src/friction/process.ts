import type { FrictionMode, LearnedRule, RuleScope, StructuredFriction } from "./types"
import { classify } from "./classifier"
import { detectSignals, looksLikeFriction } from "./detector"
import { ruleIdFromText, similarRule, upsertRule } from "./rules"
import { CharacterMode, parseCharacterMode } from "@/character/mode"
import { renderFriction, renderFrictionUserBody } from "@/character/renderer"

export type ProcessInput = {
  projectID: string
  sessionID: string
  userText: string
  priorUserTexts: string[]
  existingRules: LearnedRule[]
  modes: FrictionMode[]
  characterMode: CharacterMode | string
}

export type ProcessOutput = {
  friction: StructuredFriction | null
  /** Model inject (<system-reminder> wrapped). Null when character=off. */
  message: string | null
  /** Plain text for user-visible Friction feedback. Null when character=off. */
  userFeedback: string | null
  rules: LearnedRule[]
  disabledIds: string[]
  appliedImplicit: LearnedRule[]
}

const DISABLE_MATCH = /確認|mobile|スマホ|viewport|playwright|ui|画面|csv|excel/i

export function processFeedback(input: ProcessInput): ProcessOutput {
  const characterMode = parseCharacterMode(String(input.characterMode))
  const appliedImplicit = selectApplicableRules(input.existingRules, input.userText)

  if (!looksLikeFriction(input.userText, input.priorUserTexts.length)) {
    const appliedBody =
      appliedImplicit.length && characterMode !== CharacterMode.Off
        ? renderAppliedNoticeBody(appliedImplicit, characterMode)
        : null
    return {
      friction: null,
      message: appliedBody ? wrapReminder(appliedBody) : null,
      userFeedback: appliedBody,
      rules: input.existingRules,
      disabledIds: [],
      appliedImplicit,
    }
  }

  const signal = detectSignals(input.userText)
  const original = input.priorUserTexts[0]
  const classified = classify({
    signal,
    userFeedback: input.userText,
    originalInstruction: original,
    existingRules: input.existingRules,
    modes: input.modes,
  })

  const disabledIds: string[] = []
  let rules = [...input.existingRules]

  if (classified.friction_type === "rule_correction") {
    for (const rule of rules) {
      if (rule.status === "disabled") continue
      if (!DISABLE_MATCH.test(rule.text) && !DISABLE_MATCH.test(input.userText)) continue
      disabledIds.push(rule.id)
    }
    rules = rules.map((r) =>
      disabledIds.includes(r.id)
        ? {
            ...r,
            status: "disabled" as const,
            confidence: Math.max(0.1, r.confidence * 0.5),
            updated_at: new Date().toISOString(),
          }
        : r,
    )
  }

  const scope = clampScope(classified.scope, signal.kind === "temporary")
  const now = new Date().toISOString()
  const friction: StructuredFriction = {
    timestamp: now,
    modes: input.modes,
    original_instruction: original,
    user_feedback: input.userText,
    friction_type: classified.friction_type,
    responsibility: classified.responsibility,
    detected_gap: classified.detected_gap,
    root_cause: classified.root_cause,
    improved_instruction: classified.improved_instruction,
    candidate_rule: classified.candidate_rule,
    scope,
    confidence: classified.confidence,
    future_application: scope === "task" ? "this_task_only" : "apply_to_future_tasks",
    character_mode: characterMode,
    se_notes: classified.se_notes,
    fde_notes: classified.fde_notes,
    business_intent: classified.business_intent,
    instruction_suggestion: classified.instruction_suggestion,
    rule_id: ruleIdFromText(classified.candidate_rule),
    disable_rule_ids: disabledIds.length ? disabledIds : undefined,
  }

  if (classified.friction_type !== "rule_correction" && scope !== "task") {
    const existing = similarRule(rules, classified.candidate_rule)
    rules = upsertRule(rules, {
      id: existing?.id ?? friction.rule_id!,
      text: existing ? mergeRuleText(existing.text, classified.candidate_rule) : classified.candidate_rule,
      source: "friction-learning",
      observations: (existing?.observations ?? 0) + 1,
      confidence: nextConfidence(existing?.confidence ?? classified.confidence, existing?.observations ?? 0),
      scope: promoteScope(existing?.scope ?? scope, (existing?.observations ?? 0) + 1),
      status: nextStatus((existing?.observations ?? 0) + 1),
      modes: uniqModes([...(existing?.modes ?? []), ...input.modes]),
      tags: uniq([...(existing?.tags ?? []), ...classified.tags]),
      created_at: existing?.created_at ?? now,
      updated_at: now,
      last_friction_type: classified.friction_type,
    })
  }

  const feedbackBody = renderFrictionUserBody(friction, characterMode)
  return {
    friction,
    message: characterMode === CharacterMode.Off ? null : renderFriction(friction, characterMode),
    userFeedback: characterMode === CharacterMode.Off ? null : feedbackBody,
    rules,
    disabledIds,
    appliedImplicit,
  }
}

function clampScope(scope: RuleScope, temporary: boolean): RuleScope {
  if (temporary) return "task"
  if (scope === "general") return "project"
  return scope
}

function nextConfidence(prev: number, observationsBefore: number): number {
  const bump = observationsBefore === 0 ? 0 : 0.08
  return Math.min(0.95, prev + bump)
}

function nextStatus(observations: number): LearnedRule["status"] {
  if (observations >= 5) return "trusted"
  if (observations >= 3) return "reinforced"
  if (observations >= 2) return "observed"
  return "candidate"
}

/** Never jump to general on first sight; need repeated evidence. */
function promoteScope(scope: RuleScope, observations: number): RuleScope {
  if (scope === "task" || scope === "session") return scope
  if (scope === "general" && observations < 4) return "project"
  if (scope === "user" && observations < 3) return "project"
  return scope
}

function mergeRuleText(a: string, b: string): string {
  if (a === b) return a
  if (/viewport|mobile|スマホ|Desktop\/Mobile/i.test(a) || /viewport|mobile|スマホ|Desktop\/Mobile/i.test(b)) {
    return "UI変更後は対象viewportで表示確認する"
  }
  return a.length >= b.length ? a : b
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)]
}

function uniqModes(xs: FrictionMode[]): FrictionMode[] {
  return [...new Set(xs)]
}

export function selectApplicableRules(rules: LearnedRule[], userText: string): LearnedRule[] {
  return rules.filter((r) => {
    if (r.status === "disabled") return false
    if (r.scope === "task") return false
    if (r.confidence < 0.45) return false
    if (r.tags.includes("ui") || /ui|画面|layout|余白|カード|表示/i.test(r.text)) {
      return /ui|画面|余白|カード|見やすく|layout|表示|修正/i.test(userText)
    }
    if (r.tags.includes("csv") || /csv|excel|出力/i.test(r.text)) {
      return /csv|excel|出力|エクスポート/i.test(userText)
    }
    return r.observations >= 2 && r.scope !== "session"
  })
}

function wrapReminder(body: string) {
  return `<system-reminder>\n${body}\n</system-reminder>`
}

function renderAppliedNoticeBody(rules: LearnedRule[], mode: CharacterMode): string {
  const lines = rules.map((r) => `- ${r.text}`).join("\n")
  if (mode === CharacterMode.Off) {
    return ["Applying learned Friction rules for this task:", lines].join("\n")
  }
  return [
    "前回のFrictionから得た条件を最初から考慮しています:",
    lines,
    "必要ならユーザーに『前回の手戻りを踏まえて最初から確認している』と説明してよい。",
  ].join("\n")
}