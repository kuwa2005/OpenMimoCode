import path from "path"
import fs from "fs/promises"
import { evolveRoot } from "@/evolve/store"
import type { FrictionEventRecord, LearnedRule, StructuredFriction } from "./types"

export function frictionDir(projectID: string) {
  return path.join(evolveRoot(projectID), "friction")
}

export function learningRulesPath(projectID: string) {
  return path.join(frictionDir(projectID), "learning-rules.json")
}

export function projectRulesPath(worktree: string) {
  return path.join(worktree, ".oimo", "friction", "rules.json")
}

export async function loadRules(input: { projectID: string; worktree: string }): Promise<LearnedRule[]> {
  const fromEvolve = await readRulesFile(learningRulesPath(input.projectID))
  const fromProject = await readRulesFile(projectRulesPath(input.worktree))
  const map = new Map<string, LearnedRule>()
  for (const r of [...fromEvolve, ...fromProject]) {
    const prev = map.get(r.id)
    if (!prev || r.observations >= prev.observations) map.set(r.id, r)
  }
  return [...map.values()]
}

export async function saveRules(input: {
  projectID: string
  worktree: string
  rules: LearnedRule[]
}): Promise<void> {
  const projectScoped = input.rules.filter((r) => r.scope === "project" || r.scope === "general")
  const all = input.rules.filter((r) => r.scope !== "task")
  await writeRulesFile(learningRulesPath(input.projectID), all)
  await writeRulesFile(projectRulesPath(input.worktree), projectScoped)
}

export async function appendFrictionEvent(input: {
  projectID: string
  sessionID: string
  friction: StructuredFriction
}): Promise<FrictionEventRecord> {
  const dir = frictionDir(input.projectID)
  await fs.mkdir(dir, { recursive: true })
  const id = `fl-${Date.now()}`
  const record: FrictionEventRecord = {
    ...input.friction,
    id,
    project_id: input.projectID,
    session_id: input.sessionID,
  }
  const file = path.join(dir, `${id}.md`)
  const body = [
    `# Friction Learning Event`,
    ``,
    `- id: ${record.id}`,
    `- session: ${record.session_id}`,
    `- type: ${record.friction_type}`,
    `- responsibility: ${record.responsibility}`,
    `- scope: ${record.scope}`,
    `- confidence: ${record.confidence}`,
    `- modes: ${record.modes.join(", ")}`,
    ``,
    `## User feedback`,
    ``,
    record.user_feedback,
    ``,
    `## Detected gap`,
    ``,
    record.detected_gap,
    ``,
    `## Root cause`,
    ``,
    record.root_cause,
    ``,
    `## Candidate rule`,
    ``,
    record.candidate_rule,
    ``,
    `## Structured`,
    ``,
    "```json",
    JSON.stringify(record, null, 2),
    "```",
    ``,
  ].join("\n")
  await Bun.write(file, body)
  return record
}

async function readRulesFile(file: string): Promise<LearnedRule[]> {
  const exists = await Bun.file(file).exists()
  if (!exists) return []
  const raw = await Bun.file(file).json()
  if (!Array.isArray(raw)) return []
  return raw as LearnedRule[]
}

async function writeRulesFile(file: string, rules: LearnedRule[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await Bun.write(file, JSON.stringify(rules, null, 2) + "\n")
}

/** Format active rules for system prompt injection. */
export function formatRulesForPrompt(rules: LearnedRule[]): string {
  const active = rules.filter((r) => r.status !== "disabled" && r.scope !== "task" && r.confidence >= 0.45)
  if (!active.length) return ""
  const lines = active.map((r) => `- [${r.scope}/${r.status} c=${r.confidence.toFixed(2)}] ${r.text}`)
  return [
    "<system-reminder>",
    "Friction Learning — learned implicit requirements (apply when relevant; do not over-generalize task-scoped items):",
    ...lines,
    "When you apply a learned rule proactively, briefly tell the user why (unless character=off presentation).",
    "</system-reminder>",
  ].join("\n")
}
