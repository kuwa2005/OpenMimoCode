import path from "path"
import fs from "fs/promises"
import { BUILTIN_SCENARIOS } from "./scenarios/builtin"
import {
  formatScenarioScore,
  scoreScenario,
  type ScenarioFixture,
  type ScenarioObservation,
  type ScenarioScore,
} from "./scenario"
import { evolveRoot } from "./store"

function isFixture(value: unknown): value is ScenarioFixture {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.id === "string" && typeof v.title === "string" && Array.isArray(v.turns) && !!v.budget
}

export async function loadProjectScenarios(worktree: string): Promise<ScenarioFixture[]> {
  const dir = path.join(evolveRoot(worktree), "scenarios")
  try {
    const entries = await fs.readdir(dir)
    const out: ScenarioFixture[] = []
    for (const name of entries) {
      if (!name.endsWith(".json")) continue
      const raw = await Bun.file(path.join(dir, name)).json()
      if (isFixture(raw)) out.push(raw)
    }
    return out
  } catch {
    return []
  }
}

export async function listScenarios(worktree: string): Promise<ScenarioFixture[]> {
  const project = await loadProjectScenarios(worktree)
  const overridden = new Set(project.map((s) => s.id))
  return [...project, ...BUILTIN_SCENARIOS.filter((s) => !overridden.has(s.id))]
}

export function getScenario(fixtures: ScenarioFixture[], id: string) {
  return fixtures.find((s) => s.id === id)
}

/** Build the prompt an agent should follow when executing a scenario. */
export function scenarioRunPrompt(fixture: ScenarioFixture): string {
  return [
    `# Evolve scenario: ${fixture.id}`,
    "",
    fixture.title,
    "",
    fixture.description,
    "",
    "## User turns (in order)",
    ...fixture.turns.map((t, i) => `${i + 1}. ${t}`),
    "",
    "## Budgets (must not exceed)",
    "```json",
    JSON.stringify(fixture.budget, null, 2),
    "```",
    "",
    `## Expectation`,
    fixture.expect,
    "",
    "Handle the turns. Prefer tools over asking the user. When done, report a JSON observation:",
    '```json',
    JSON.stringify(
      {
        userClarifications: 0,
        toolCalls: 0,
        sameFileReads: 0,
        corrections: 0,
        skillsUsed: [],
        askedUserFor: [],
      } satisfies ScenarioObservation,
      null,
      2,
    ),
    "```",
  ].join("\n")
}

export function scoreObservation(fixture: ScenarioFixture, obs: ScenarioObservation): ScenarioScore {
  return scoreScenario(fixture, obs)
}

export function formatScenarioList(fixtures: ScenarioFixture[]): string {
  const lines = ["# Evolve scenarios", ""]
  for (const f of fixtures) {
    lines.push(`- \`${f.id}\` [${f.pattern}] — ${f.title}`)
  }
  lines.push("", "Run with evolve_status operation=scenario_run and scenario_id=<id>.")
  return lines.join("\n")
}

export function formatScores(scores: ScenarioScore[]): string {
  const passed = scores.filter((s) => s.pass).length
  return [
    `# Scenario gate: ${passed}/${scores.length} passed`,
    "",
    ...scores.map((s) => formatScenarioScore(s)),
  ].join("\n\n")
}
