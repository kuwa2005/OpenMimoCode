import { Schema } from "effect"
import { zod } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"

export const Info = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "AI-driven autonomous mode: hear requirements first (when hearing_first), then auto-approve safe permissions and continue until an independent judge confirms documentary completion or a budget limit is reached.",
  }),
  hearing_first: Schema.optional(Schema.Boolean).annotate({
    description:
      "When true (default), start in a hearing phase: ask the user clarifying questions and lock requirements before enabling never-ask / non-stop execution.",
  }),
  docs_evidence: Schema.optional(Schema.Boolean).annotate({
    description:
      "When true (default), the stop-condition requires documentary evidence (hearing log, requirements/specs including test criteria, verification) before the judge may allow stop.",
  }),
  max_turns: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))).annotate({
    description: "Maximum judge-driven re-entries per task (default 50).",
  }),
  max_duration_ms: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))).annotate({
    description: "Wall-clock budget per task in milliseconds (default 7_200_000 = 2h).",
  }),
  max_cost_usd: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))).annotate({
    description: "Soft cumulative cost ceiling per task in USD (default 10). Checked before each model call.",
  }),
  judge_max_retries: Schema.optional(Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0))).annotate({
    description: "Judge evaluation retries before stopping with judge_failed (default 2).",
  }),
}).pipe(withStatics((s) => ({ zod: zod(s) })))

export type Info = Schema.Schema.Type<typeof Info>

export const DEFAULT_MAX_TURNS = 50
export const DEFAULT_MAX_DURATION_MS = 7_200_000
export const DEFAULT_MAX_COST_USD = 10
export const DEFAULT_JUDGE_MAX_RETRIES = 2

export type Limits = {
  maxTurns: number
  maxDurationMs: number
  maxCostUsd: number
  judgeMaxRetries: number
}

export function limits(cfg?: Info): Limits {
  return {
    maxTurns: cfg?.max_turns ?? DEFAULT_MAX_TURNS,
    maxDurationMs: cfg?.max_duration_ms ?? DEFAULT_MAX_DURATION_MS,
    maxCostUsd: cfg?.max_cost_usd ?? DEFAULT_MAX_COST_USD,
    judgeMaxRetries: cfg?.judge_max_retries ?? DEFAULT_JUDGE_MAX_RETRIES,
  }
}

/** True when autonomous hands-free mode is active (includes legacy auto_continue). */
export function enabled(cfg: { autonomy?: Info; experimental?: { auto_continue?: boolean } }): boolean {
  if (cfg.autonomy?.enabled === true) return true
  return cfg.experimental?.auto_continue === true
}

/** Default true: clarify with the user before never-ask execution. */
export function hearingFirst(cfg?: Info): boolean {
  return cfg?.hearing_first !== false
}

/** Default true: documentary evidence is part of the stop condition. */
export function docsEvidence(cfg?: Info): boolean {
  return cfg?.docs_evidence !== false
}

/** Headers that mark the requirements-lock gate (case-insensitive). */
export function isRequirementsLockHeader(header?: string): boolean {
  if (!header) return false
  return /requirements?\s*lock|spec\s*lock|仕様確定|要件ロック|要件確定/i.test(header)
}

/** Affirmative answers that lock requirements and enter execute phase. */
export function isLockApproval(answers: ReadonlyArray<ReadonlyArray<string> | undefined>): boolean {
  const flat = answers.flatMap((a) => a ?? []).join(" ")
  if (!flat) return false
  return /(approved|looks good|proceed|yes|ok|lgtm|承認|確定|進めて|問題ない)/i.test(flat)
}

export function buildGoalCondition(userText: string, opts: { docsEvidence: boolean; hearingFirst: boolean }): string {
  const lines = [
    "Deliver the user's request as an excellent SE would: uncover hidden needs, lock requirements with the customer, leave documentary evidence, then implement and verify without stopping.",
    "",
    "User request:",
    userText,
  ]
  if (opts.hearingFirst) {
    lines.push(
      "",
      "Phase A — Hearing (before any implementation code):",
      "- Read between the lines; surface assumptions the customer has not stated.",
      "- Ask clarifying questions via the question tool (compose:ask). Prefer structured options.",
      "- For every question, record in the hearing log: why you asked, background/assumption, and the answer/result.",
      "- When requirements are clear, present a concise design and ask a Requirements Lock question (header exactly: `Requirements Lock`) with Approved / Changes needed.",
      "- Do NOT write implementation code until Requirements Lock is Approved.",
    )
  }
  if (opts.docsEvidence) {
    lines.push(
      "",
      "Documentary evidence (required before stop; scale depth to complexity, never skip hearing transparency):",
      "- Hearing log: each Q with why / background / result",
      "- Requirements / overview / functional specs as needed for the scope",
      "- Test criteria are PART OF the specs (acceptance, unit/integration/smoke/e2e as appropriate) — not an afterthought",
      "- Detailed/module design when the work warrants it",
      "- Verification evidence: commands run and pass (or honest blockers)",
      "Save under the compose docs dir (`specs/`, `plans/`, `reports/`). AI-driven delivery means the trail of decisions is obvious from the docs alone.",
    )
  }
  lines.push(
    "",
    "Phase B — After Requirements Lock: implement, verify, and finish non-stop. Do not stop until the request is done with verifiable evidence in the transcript and docs.",
  )
  return lines.join("\n")
}
