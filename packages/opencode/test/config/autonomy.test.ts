import { describe, expect, test } from "bun:test"
import * as ConfigAutonomy from "../../src/config/autonomy"

describe("ConfigAutonomy helpers", () => {
  test("hearingFirst defaults true", () => {
    expect(ConfigAutonomy.hearingFirst(undefined)).toBe(true)
    expect(ConfigAutonomy.hearingFirst({})).toBe(true)
    expect(ConfigAutonomy.hearingFirst({ hearing_first: false })).toBe(false)
  })

  test("docsEvidence defaults true", () => {
    expect(ConfigAutonomy.docsEvidence(undefined)).toBe(true)
    expect(ConfigAutonomy.docsEvidence({ docs_evidence: false })).toBe(false)
  })

  test("isRequirementsLockHeader matches EN/JA", () => {
    expect(ConfigAutonomy.isRequirementsLockHeader("Requirements Lock")).toBe(true)
    expect(ConfigAutonomy.isRequirementsLockHeader("仕様確定")).toBe(true)
    expect(ConfigAutonomy.isRequirementsLockHeader("Design Review")).toBe(false)
  })

  test("isLockApproval detects affirmative answers", () => {
    expect(ConfigAutonomy.isLockApproval([["Approved"]])).toBe(true)
    expect(ConfigAutonomy.isLockApproval([["Changes needed"]])).toBe(false)
    expect(ConfigAutonomy.isLockApproval([["確定"]])).toBe(true)
  })

  test("buildGoalCondition includes hearing and docs when enabled", () => {
    const text = ConfigAutonomy.buildGoalCondition("電卓を作って", {
      docsEvidence: true,
      hearingFirst: true,
    })
    expect(text).toContain("電卓を作って")
    expect(text).toContain("Requirements Lock")
    expect(text).toContain("Hearing log")
    expect(text).toContain("Test specification")
    expect(text).toContain("Tests EXECUTED")
  })
})
