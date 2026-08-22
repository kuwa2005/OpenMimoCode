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

/** Runtime / UI auto-mode tiers selectable via `/auto`. */
export type Mode = "none" | "normal" | "special"

const MODES: readonly Mode[] = ["none", "normal", "special"]

export function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value)
}

/** Resolve current mode from merged config (after Flag overlays). */
export function mode(cfg: { autonomy?: Info; experimental?: { auto_continue?: boolean } }): Mode {
  if (!enabled(cfg)) return "none"
  if (!hearingFirst(cfg.autonomy)) return "special"
  return "normal"
}

/** Config patch written by `/auto` (global oimo.json). */
export function patchForMode(next: Mode): { autonomy: Info } {
  if (next === "none") return { autonomy: { enabled: false } }
  if (next === "special") return { autonomy: { enabled: true, hearing_first: false } }
  return { autonomy: { enabled: true, hearing_first: true } }
}

/**
 * Align process env with `/auto` so Flag.MIMOCODE_* matches the chosen mode
 * after instance dispose/reload (CLI --spauto/--autonomy must not stick).
 */
export function applyProcessEnv(next: Mode) {
  const clear = (...keys: string[]) => {
    for (const key of keys) delete process.env[key]
  }
  if (next === "none") {
    clear(
      "MIMOCODE_AUTONOMY",
      "MIMOCODE_SPAUTO",
      "MIMOCODE_AUTOSP",
      "MIMOCODE_DANGEROUSLY_SKIP_PERMISSIONS",
      "MIMOCODE_AUTO_APPROVE_DELETE",
    )
    return
  }
  process.env.MIMOCODE_AUTONOMY = "1"
  process.env.MIMOCODE_DANGEROUSLY_SKIP_PERMISSIONS = "1"
  if (next === "special") {
    process.env.MIMOCODE_SPAUTO = "1"
    process.env.MIMOCODE_AUTO_APPROVE_DELETE = "1"
    return
  }
  clear("MIMOCODE_SPAUTO", "MIMOCODE_AUTOSP", "MIMOCODE_AUTO_APPROVE_DELETE")
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
    opts.hearingFirst
      ? "Deliver the user's request as an excellent SE would: uncover hidden needs, lock requirements with the customer, leave documentary evidence, then implement and verify without stopping."
      : "Deliver the user's request in Super Auto (special) mode: raise every material doubt, answer it yourself from context, leave documentary evidence, then implement and verify completely non-stop with zero user waits.",
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
  if (!opts.hearingFirst) {
    lines.push(
      "",
      "Phase A — Super Auto / special (self-hearing; never wait on the user):",
      "- Raise the same questions an SE would ask (hidden needs, platforms, constraints, success criteria).",
      "- Answer them yourself from the repo, docs, and prior user answers in this session. Prefer the question tool for structure, but never-ask is on — you will get [Never-Ask]; choose immediately and continue.",
      "- Do NOT block on a human. Do NOT end a turn waiting for input.",
      "- Record each material decision as self-answered Q&A in the hearing log: why / background / chosen result.",
      "- Skip Requirements Lock with the user; treat recorded assumptions as locked and proceed immediately.",
    )
  }
  if (opts.docsEvidence) {
    lines.push(
      "",
      "Documentary evidence — ALL numbered items below are MANDATORY before stop. Judge: verify each item against the transcript individually; if ANY item lacks evidence, the condition is NOT satisfied:",
      "1. Hearing log: every question asked (or self-answered in Super Auto), each with why / background / result",
      "2. Requirements + functional specification covering the delivered scope",
      "3. Test specification written as part of the specs: concrete test cases with inputs and expected results (unit / integration / smoke / e2e as applicable — at minimum unit cases for core logic plus an acceptance checklist)",
      "4. Tests EXECUTED, not merely written: an automated test program was created and run (preferred), or a manual test run is documented case-by-case; actual pass/fail results recorded in a report",
      "5. Verification evidence: commands run and their output (or honest blockers)",
      "Document length may scale with complexity, but no item may be skipped — even a single-file project gets a short test spec and an executed test run, never zero.",
      "Save under the compose docs dir (`specs/`, `plans/`, `reports/`). AI-driven delivery means the trail of decisions is obvious from the docs alone.",
    )
  }
  lines.push(
    "",
    opts.hearingFirst
      ? "Phase B — After Requirements Lock: implement, then write and RUN the tests defined in the test specification, record results, and finish non-stop. Do not stop until the request is done with verifiable evidence in the transcript and docs."
      : "Phase B — Execute immediately: implement, then write and RUN the tests defined in the test specification, record results, and finish non-stop. Do not stop for user input. Do not stop until the request is done with verifiable evidence in the transcript and docs.",
  )
  return lines.join("\n")
}

/** Pull the original user request out of a goal condition built by `buildGoalCondition`. */
export function extractUserRequest(condition: string): string | undefined {
  const match = condition.match(/User request:\n([\s\S]*?)(?:\n\nPhase [AB]|\n\nDocumentary evidence|$)/)
  const text = match?.[1]?.trim()
  return text || undefined
}
