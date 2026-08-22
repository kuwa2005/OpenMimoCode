import { describe, expect, test } from "bun:test"
import { sanitizeDisplayText } from "../../../../src/cli/cmd/tui/util/display-width"

describe("sanitizeDisplayText", () => {
  test("replaces arrows that shift CJK cells", () => {
    expect(sanitizeDisplayText("Auto (無料) → Big Pickle")).toBe("Auto (無料) -> Big Pickle")
    expect(sanitizeDisplayText("発見→分析→制作")).toBe("発見->分析->制作")
    expect(sanitizeDisplayText("A ⇒ B")).toBe("A => B")
    expect(sanitizeDisplayText("← back")).toBe("<- back")
    expect(sanitizeDisplayText("↳ Loaded")).toBe("-> Loaded")
  })

  test("replaces ambiguous dashes and bullets", () => {
    expect(sanitizeDisplayText("無料 — OK")).toBe("無料 - OK")
    expect(sanitizeDisplayText("A · B")).toBe("A | B")
  })

  test("leaves plain ASCII and CJK alone", () => {
    expect(sanitizeDisplayText("無料でOK")).toBe("無料でOK")
    expect(sanitizeDisplayText("a -> b")).toBe("a -> b")
  })
})
