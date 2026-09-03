import { describe, expect, test } from "bun:test"
import { processFeedback } from "../../src/friction/process"
import { detectSignals, looksLikeFriction } from "../../src/friction/detector"
import { classify } from "../../src/friction/classifier"
import { renderFriction } from "../../src/character/renderer"
import { CharacterMode, parseCharacterMode, validateCharacterArg } from "../../src/character/mode"
import type { LearnedRule, StructuredFriction } from "../../src/friction/types"

describe("Character CLI modes", () => {
  test("default when empty; rejects unknown and on", () => {
    expect(parseCharacterMode(undefined)).toBe(CharacterMode.Default)
    expect(parseCharacterMode("")).toBe(CharacterMode.Default)
    expect(parseCharacterMode("off")).toBe(CharacterMode.Off)
    expect(validateCharacterArg("unknown")).toContain("Unknown character mode: unknown")
    expect(validateCharacterArg("on")).toContain("Available modes")
  })
})

describe("Friction detection scenarios", () => {
  test("Scenario A: repeated size → Interpretation Gap", () => {
    const out = processFeedback({
      projectID: "p",
      sessionID: "s",
      userText: "もっと大きく",
      priorUserTexts: ["文字を大きくして", "まだ小さい"],
      existingRules: [],
      modes: ["se"],
      characterMode: "default",
    })
    expect(out.friction?.friction_type).toBe("interpretation_gap")
    expect(out.friction?.responsibility).toBe("agent_interpretation")
    expect(out.rules.some((r) => /視認性|サイズ/.test(r.text))).toBe(true)
  })

  test("Scenario B: mobile after UI → Instruction Gap / Requirement Discovery", () => {
    const out = processFeedback({
      projectID: "p",
      sessionID: "s",
      userText: "スマホでも確認して",
      priorUserTexts: ["UIを修正して"],
      existingRules: [],
      modes: ["se"],
      characterMode: "default",
    })
    expect(out.friction).toBeTruthy()
    expect(["instruction_gap", "requirement_discovery"]).toContain(out.friction!.friction_type)
    expect(out.friction?.scope).toBe("project")
  })

  test("Scenario C: mobile bug with existing rule → Verification Gap (agent)", () => {
    const rule: LearnedRule = {
      id: "ui-verify",
      text: "UIはDesktop/Mobile双方確認",
      source: "friction-learning",
      observations: 2,
      confidence: 0.7,
      scope: "project",
      status: "observed",
      modes: ["se"],
      tags: ["ui", "mobile"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }
    const out = processFeedback({
      projectID: "p",
      sessionID: "s",
      userText: "スマホで崩れている",
      priorUserTexts: ["UI修正"],
      existingRules: [rule],
      modes: ["se"],
      characterMode: "default",
    })
    expect(out.friction?.friction_type).toBe("verification_gap")
    expect(out.friction?.responsibility).toBe("agent_verification")
  })

  test("Scenario D: CSV/Excel under --fde includes business intent", () => {
    const out = processFeedback({
      projectID: "p",
      sessionID: "s",
      userText: "Excelで文字化けする",
      priorUserTexts: ["CSV出力を追加"],
      existingRules: [],
      modes: ["fde"],
      characterMode: "default",
    })
    expect(out.friction?.friction_type).toBe("requirement_discovery")
    expect(out.friction?.business_intent).toBeTruthy()
    expect(out.friction?.fde_notes).toBeTruthy()
  })

  test("Scenario E: 今回だけ → Task scope, no durable rule", () => {
    const out = processFeedback({
      projectID: "p",
      sessionID: "s",
      userText: "今回だけボタンを赤くして",
      priorUserTexts: [],
      existingRules: [],
      modes: ["se"],
      characterMode: "default",
    })
    expect(out.friction?.scope).toBe("task")
    expect(out.rules.length).toBe(0)
  })

  test("Scenario F: Playwright ask with rule → Verification Gap agent", () => {
    const rule: LearnedRule = {
      id: "pw",
      text: "UI変更はPlaywright確認必須",
      source: "friction-learning",
      observations: 3,
      confidence: 0.8,
      scope: "project",
      status: "reinforced",
      modes: ["se"],
      tags: ["verification", "playwright"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }
    const out = processFeedback({
      projectID: "p",
      sessionID: "s",
      userText: "Playwrightで確認した？",
      priorUserTexts: ["ボタン色を変えて"],
      existingRules: [rule],
      modes: ["se"],
      characterMode: "off",
    })
    expect(out.friction?.friction_type).toBe("verification_gap")
    expect(out.friction?.responsibility).toBe("agent_verification")
  })

  test("Scenario G: disable learned rule", () => {
    const rule: LearnedRule = {
      id: "ui-verify",
      text: "UI変更後はスマホ確認",
      source: "friction-learning",
      observations: 2,
      confidence: 0.7,
      scope: "project",
      status: "observed",
      modes: ["se"],
      tags: ["ui", "mobile"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }
    const out = processFeedback({
      projectID: "p",
      sessionID: "s",
      userText: "今後その確認はいらない",
      priorUserTexts: ["UI直して"],
      existingRules: [rule],
      modes: ["se"],
      characterMode: "default",
    })
    expect(out.friction?.friction_type).toBe("rule_correction")
    expect(out.rules.find((r) => r.id === "ui-verify")?.status).toBe("disabled")
  })

  test("next task applies prior friction rule", () => {
    const learned: LearnedRule = {
      id: "ui-responsive-verification",
      text: "UI変更時はDesktop/Mobile双方で表示確認する",
      source: "friction-learning",
      observations: 2,
      confidence: 0.7,
      scope: "project",
      status: "observed",
      modes: ["se"],
      tags: ["ui", "mobile", "responsive"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }
    const out = processFeedback({
      projectID: "p",
      sessionID: "s2",
      userText: "こっちの画面も見やすくして",
      priorUserTexts: [],
      existingRules: [learned],
      modes: ["se"],
      characterMode: "default",
    })
    expect(out.friction).toBeNull()
    expect(out.appliedImplicit.some((r) => r.id === learned.id)).toBe(true)
    expect(out.message).toContain("前回")
  })
})

describe("Character does not alter structured result", () => {
  test("default vs off messages differ; analysis fields identical", () => {
    const base = processFeedback({
      projectID: "p",
      sessionID: "s",
      userText: "スマホでも確認して",
      priorUserTexts: ["UIを修正して"],
      existingRules: [],
      modes: ["se", "fde"],
      characterMode: "default",
    })
    const off = processFeedback({
      projectID: "p",
      sessionID: "s",
      userText: "スマホでも確認して",
      priorUserTexts: ["UIを修正して"],
      existingRules: [],
      modes: ["se", "fde"],
      characterMode: "off",
    })
    expect(base.friction).toBeTruthy()
    expect(off.friction).toBeTruthy()
    const strip = (f: StructuredFriction) => {
      const { character_mode: _, timestamp: __, ...rest } = f
      return rest
    }
    expect(strip(base.friction!)).toEqual(strip(off.friction!))
    expect(base.message).not.toEqual(off.message)
    expect(off.message).toContain("追加要件")
    expect(base.message).toMatch(/最初の指示|認識差|不足/)
  })

  test("renderer never flips responsibility", () => {
    const friction: StructuredFriction = {
      timestamp: "t",
      modes: ["se"],
      user_feedback: "x",
      friction_type: "verification_gap",
      responsibility: "agent_verification",
      detected_gap: "g",
      root_cause: "r",
      candidate_rule: "rule",
      scope: "project",
      confidence: 0.8,
      future_application: "apply_to_future_tasks",
      character_mode: "default",
    }
    const a = renderFriction(friction, CharacterMode.Default)
    const b = renderFriction(friction, CharacterMode.Off)
    expect(a).toContain("agent_verification")
    expect(b).toContain("agent_verification")
    expect(a).not.toContain("user_instruction")
  })
})

describe("detector helpers", () => {
  test("looksLikeFriction requires prior turn except temporary", () => {
    expect(looksLikeFriction("フォームを作って", 0)).toBe(false)
    expect(looksLikeFriction("今回だけ赤くして", 0)).toBe(true)
    expect(looksLikeFriction("違う", 1)).toBe(true)
    expect(detectSignals("元に戻して").kind).toBe("revert")
  })
})
