import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { compareFriction, combineGate, formatEval } from "../../src/evolve/evaluate"
import { createSnapshot, listSnapshots, rollbackSnapshot } from "../../src/evolve/rollback"
import { evolveRoot, loadDashboard, formatDashboard } from "../../src/evolve/store"
import type { FrictionMetrics } from "../../src/evolve/metrics"
import { scoreScenario } from "../../src/evolve/scenario"
import { BUILTIN_SCENARIOS } from "../../src/evolve/scenarios/builtin"
import { formatScenarioList, listScenarios, scoreObservation } from "../../src/evolve/scenarios"
import { buildEvolveTask } from "../../src/session/auto-evolve"
import { Global } from "../../src/global"

function metrics(partial: Partial<FrictionMetrics>): FrictionMetrics {
  return {
    windowDays: 7,
    cutoffMs: 0,
    sessions: 1,
    userTurns: 10,
    assistantTurns: 20,
    toolCalls: 100,
    toolByName: [],
    readReplays: [],
    correctionHints: 5,
    humanAttentionCost: { score: 30, level: "medium", drivers: ["x"] },
    ...partial,
  }
}

describe("evolve evaluate", () => {
  test("pass when metrics improve", () => {
    const cmp = compareFriction(
      metrics({ toolCalls: 200, correctionHints: 8, humanAttentionCost: { score: 50, level: "high", drivers: [] } }),
      metrics({ toolCalls: 80, correctionHints: 2, humanAttentionCost: { score: 10, level: "low", drivers: [] } }),
    )
    expect(cmp.verdict).toBe("pass")
    expect(formatEval(cmp)).toContain("Adopt")
  })

  test("fail when metrics worsen", () => {
    const cmp = compareFriction(
      metrics({ toolCalls: 50, correctionHints: 1, humanAttentionCost: { score: 5, level: "low", drivers: [] } }),
      metrics({ toolCalls: 200, correctionHints: 9, humanAttentionCost: { score: 60, level: "high", drivers: [] } }),
    )
    expect(cmp.verdict).toBe("fail")
  })

  test("combineGate fails on scenario fail even if friction passes", () => {
    const friction = compareFriction(
      metrics({ toolCalls: 200, correctionHints: 8, humanAttentionCost: { score: 50, level: "high", drivers: [] } }),
      metrics({ toolCalls: 80, correctionHints: 2, humanAttentionCost: { score: 10, level: "low", drivers: [] } }),
    )
    const scenario = scoreScenario(BUILTIN_SCENARIOS[0]!, {
      userClarifications: 5,
      toolCalls: 10,
      sameFileReads: 0,
      corrections: 0,
      skillsUsed: [],
      askedUserFor: ["which file"],
    })
    expect(scenario.pass).toBe(false)
    expect(combineGate({ friction, scenarios: [scenario] }).verdict).toBe("fail")
  })
})

describe("evolve scenarios", () => {
  test("builtin fixtures are loadable and scoreable", async () => {
    const projectID = `sc-builtin-${Date.now()}`
    const list = await listScenarios(projectID)
    expect(list.length).toBeGreaterThanOrEqual(5)
    expect(formatScenarioList(list)).toContain("excess-clarification-basic")

    const fixture = list.find((s) => s.id === "tool-churn-search")!
    const pass = scoreObservation(fixture, {
      userClarifications: 0,
      toolCalls: 8,
      sameFileReads: 1,
      corrections: 0,
      skillsUsed: [],
      askedUserFor: [],
    })
    expect(pass.pass).toBe(true)

    const fail = scoreObservation(fixture, {
      userClarifications: 0,
      toolCalls: 99,
      sameFileReads: 1,
      corrections: 0,
      skillsUsed: [],
      askedUserFor: [],
    })
    expect(fail.pass).toBe(false)
  })

  test("project scenario overrides builtin id", async () => {
    const projectID = `sc-ov-${Date.now()}`
    const dir = path.join(evolveRoot(projectID), "scenarios")
    await fs.mkdir(dir, { recursive: true })
    await Bun.write(
      path.join(dir, "excess-clarification-basic.json"),
      JSON.stringify({
        id: "excess-clarification-basic",
        title: "override",
        pattern: "excess_clarification",
        description: "project override",
        turns: ["x"],
        budget: { maxUserClarifications: 0 },
        expect: "no questions",
      }),
    )
    const list = await listScenarios(projectID)
    const hit = list.find((s) => s.id === "excess-clarification-basic")!
    expect(hit.title).toBe("override")
    await fs.rm(evolveRoot(projectID), { recursive: true, force: true })
  })
})

describe("evolve rollback", () => {
  test("snapshot and rollback restores skill file", async () => {
    const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "evolve-rb-"))
    const projectID = `rb-${Date.now()}`
    const skillDir = path.join(worktree, ".oimo", "skills", "demo")
    await fs.mkdir(skillDir, { recursive: true })
    await Bun.write(path.join(skillDir, "SKILL.md"), "v1")

    const snap = await createSnapshot({ projectID, worktree }, "test")
    expect(snap.targets).toContain("skills")
    expect(snap.path.startsWith(path.join(Global.Path.home, ".oimo", "evolve", projectID))).toBe(true)

    await Bun.write(path.join(skillDir, "SKILL.md"), "v2-broken")
    const list = await listSnapshots(projectID)
    expect(list.some((s) => s.id === snap.id)).toBe(true)

    await rollbackSnapshot({ projectID, worktree }, snap.id)
    expect(await Bun.file(path.join(skillDir, "SKILL.md")).text()).toBe("v1")

    const dash = await loadDashboard({ projectID, worktree })
    expect(dash.skillsCount).toBe(1)
    expect(dash.root).toBe(evolveRoot(projectID))
    expect(formatDashboard(dash)).toContain("Self Evolution")

    await fs.rm(evolveRoot(projectID), { recursive: true, force: true })
    await fs.rm(worktree, { recursive: true, force: true })
  })
})

describe("buildEvolveTask mentions evolve_status", () => {
  test("includes tool guidance and trigger reasons", () => {
    const text = buildEvolveTask({
      skills: true,
      briefs: true,
      friction: true,
      backlog: true,
      sessionReview: true,
      triggerReasons: ["hac_high"],
    })
    expect(text).toContain("evolve_status")
    expect(text).toContain("hac_high")
    expect(text).toContain("~/.oimo/evolve/<projectID>/")
  })
})

describe("evolveRoot location", () => {
  test("lives under ~/.oimo/evolve/<projectID>", () => {
    expect(evolveRoot("proj_x")).toBe(path.join(Global.Path.home, ".oimo", "evolve", "proj_x"))
  })
})
