import { Effect } from "effect"
import { isMemoryWriteEnabled } from "@/memory/write-gate"
import { Database, eq, desc, asc, isNull } from "@/storage"
import { SessionTable } from "./session.sql"
import { Log } from "@/util"
import type { Config } from "@/config"
import { InstanceState } from "@/effect"
import { evaluateConditionTriggers } from "@/evolve/triggers"

const log = Log.create({ service: "auto-evolve" })

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_EVOLVE_INTERVAL_DAYS = 14
const MIN_SPAWN_GAP_MS = 10_000
const MIN_CONDITION_GAP_MS = 60 * 60 * 1000

export const AUTO_EVOLVE_TITLE = "Auto Evolve"

let lastEvolveSpawnTime = 0

function optOutEnabled(value: boolean | undefined): boolean {
  return value !== false
}

export function evolveSkillsEnabled(cfg: Config.Info): boolean {
  return optOutEnabled(cfg.evolve?.skills?.enabled)
}

export function evolveBriefsEnabled(cfg: Config.Info): boolean {
  return optOutEnabled(cfg.evolve?.briefs?.enabled)
}

export function evolveFrictionEnabled(cfg: Config.Info): boolean {
  return optOutEnabled(cfg.evolve?.friction?.enabled)
}

export function evolveBacklogEnabled(cfg: Config.Info): boolean {
  return optOutEnabled(cfg.evolve?.backlog?.enabled)
}

export function evolveSessionReviewEnabled(cfg: Config.Info): boolean {
  return optOutEnabled(cfg.evolve?.session_review?.enabled)
}

export function buildEvolveTask(input: {
  skills: boolean
  briefs: boolean
  friction: boolean
  backlog: boolean
  sessionReview: boolean
  manual?: boolean
  arguments?: string
  triggerReasons?: string[]
}): string {
  const mode = input.manual ? "manual" : "automatic"
  const tracks = [
    `Track A (skill knowledge base): ${input.skills ? "ENABLED" : "DISABLED"}`,
    `Track B (product modification briefs for external coding agents): ${input.briefs ? "ENABLED" : "DISABLED"}`,
    `Track C (friction / Human Attention Cost analysis): ${input.friction ? "ENABLED" : "DISABLED"}`,
    `Track D (self-improvement backlog): ${input.backlog ? "ENABLED" : "DISABLED"}`,
    `Track E (session self-evaluation reviews): ${input.sessionReview ? "ENABLED" : "DISABLED"}`,
  ]
  const lines = [
    `Run one ${mode} Self Improvement Session (evolve pass) for the current project.`,
    "",
    "This is the closed Observe→Analyze→Propose loop. Do not modify oimo product source;",
    "write proposals for the user to review and hand to an external coding agent.",
    "",
    "Start with the `evolve_status` tool: snapshot (before writes), metrics, then dashboard.",
    "Use evolve_status scenarios / scenario_prompt / scenario_score for friction regressions.",
    "Use evolve_status gate to combine friction + scenario results before recommending adopt.",
    "After briefs: suggest workflow evolve-review, then (only with explicit user approval) evolve-apply { approved: true }.",
    "",
    "Tracks for this run:",
    ...tracks.map((t) => `- ${t}`),
    "",
    "Use the memory files as the working index and the raw oimo trajectory database as the source of truth.",
    "Inventory existing project `.oimo/skills` and `~/.oimo/evolve/<projectID>/` assets first; prefer extend over duplicate.",
    "Write skills under `<worktree>/.oimo/skills/`.",
    "Write self-evolution logs under `~/.oimo/evolve/<projectID>/`:",
    "  briefs/, friction/, backlog/BACKLOG.md, reviews/, INDEX.md, history/HISTORY.md, scenarios/, snapshots/.",
    "Quantify bottlenecks (tool churn, re-reads, corrections, Human Attention Cost) before proposing.",
    "Classify each item as skill/project-local vs oimo-product before choosing the route.",
    "Use bash for read-only SQLite and filesystem inspection. Do not modify the database.",
    "Produce only high-confidence artifacts. Doing nothing is a valid success.",
  ]
  if (input.triggerReasons?.length) {
    lines.push("", "Auto-trigger reasons:", ...input.triggerReasons.map((r) => `- ${r}`))
  }
  if (input.manual && input.arguments?.trim()) {
    lines.push("", "User focus or constraints:", input.arguments.trim())
  }
  return lines.join("\n")
}

export const EVOLVE_TASK = buildEvolveTask({
  skills: true,
  briefs: true,
  friction: true,
  backlog: true,
  sessionReview: true,
})

function shouldAutoRun(input: {
  enabled: boolean
  intervalDays: number
  title: string
  label: string
}) {
  return Effect.gen(function* () {
    if (!input.enabled) return false

    const intervalMs = input.intervalDays * DAY_MS

    const lastRun = yield* Effect.sync(() =>
      Database.use((db) =>
        db
          .select({ time_created: SessionTable.time_created })
          .from(SessionTable)
          .where(eq(SessionTable.title, input.title))
          .orderBy(desc(SessionTable.time_created))
          .limit(1)
          .get(),
      ),
    )

    const now = Date.now()
    const elapsed = lastRun ? now - lastRun.time_created : Infinity

    if (!lastRun) {
      const earliest = yield* Effect.sync(() =>
        Database.use((db) =>
          db
            .select({ time_created: SessionTable.time_created })
            .from(SessionTable)
            .where(isNull(SessionTable.parent_id))
            .orderBy(asc(SessionTable.time_created))
            .limit(1)
            .get(),
        ),
      )
      if (!earliest || now - earliest.time_created < intervalMs) {
        log.info(`auto-${input.label} skipped — project too young`, {
          projectAge: earliest ? Math.round((now - earliest.time_created) / DAY_MS) + "d" : "empty",
          interval: input.intervalDays + "d",
        })
        return false
      }
    }

    if (elapsed < intervalMs) {
      log.info(`auto-${input.label} skipped — last run too recent`, {
        lastRunAgo: Math.round(elapsed / DAY_MS) + "d",
        interval: input.intervalDays + "d",
      })
      return false
    }

    log.info(`auto-${input.label} triggering`, {
      lastRun: lastRun ? new Date(lastRun.time_created).toISOString() : "never",
      interval: input.intervalDays + "d",
    })
    return true
  })
}

export function shouldAutoEvolve(cfg: Config.Info) {
  return Effect.gen(function* () {
    if (!isMemoryWriteEnabled(cfg)) return false
    if (cfg.evolve?.auto !== true) return false

    const now = Date.now()
    if (now - lastEvolveSpawnTime < MIN_SPAWN_GAP_MS) return false

    const intervalDays = cfg.evolve?.interval_days ?? DEFAULT_EVOLVE_INTERVAL_DAYS
    const due = yield* shouldAutoRun({
      enabled: true,
      intervalDays,
      title: AUTO_EVOLVE_TITLE,
      label: "evolve",
    })
    if (due) {
      lastEvolveSpawnTime = now
      return true
    }

    if (now - lastEvolveSpawnTime < MIN_CONDITION_GAP_MS) return false
    if (cfg.evolve?.condition_triggers === false) return false

    const ctx = yield* InstanceState.context
    const decision = yield* Effect.sync(() =>
      evaluateConditionTriggers({ projectID: ctx.project.id, windowDays: 7 }),
    )
    if (!decision.fire) return false

    log.info("auto-evolve triggering — condition", { reasons: decision.reasons })
    lastEvolveSpawnTime = now
    return true
  })
}

export function evolveTaskForConfig(
  cfg: Config.Info,
  input?: { manual?: boolean; arguments?: string; triggerReasons?: string[] },
) {
  return buildEvolveTask({
    skills: evolveSkillsEnabled(cfg),
    briefs: evolveBriefsEnabled(cfg),
    friction: evolveFrictionEnabled(cfg),
    backlog: evolveBacklogEnabled(cfg),
    sessionReview: evolveSessionReviewEnabled(cfg),
    manual: input?.manual,
    arguments: input?.arguments,
    triggerReasons: input?.triggerReasons,
  })
}

export * as AutoEvolve from "./auto-evolve"
