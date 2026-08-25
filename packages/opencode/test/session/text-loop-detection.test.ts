import { describe, expect, test } from "bun:test"
import {
  normalizeForLoopDetection,
  detectTextLoop,
  similarEnough,
  stepLoopFingerprint,
  intentFingerprint,
  TEXT_LOOP_TRIGGER_COUNT,
  TEXT_LOOP_BUFFER_SIZE,
  TEXT_LOOP_MAX_RECOVERY,
} from "../../src/session/prompt/text-loop-recovery"

describe("normalizeForLoopDetection", () => {
  test("trims whitespace", () => {
    expect(normalizeForLoopDetection("  hello world  ")).toBe("hello world")
  })

  test("lowercases text", () => {
    expect(normalizeForLoopDetection("Hello World")).toBe("hello world")
  })

  test("collapses multiple whitespace", () => {
    expect(normalizeForLoopDetection("hello   \n\t  world")).toBe("hello world")
  })

  test("strips common filler prefixes", () => {
    expect(normalizeForLoopDetection("Let me check the file")).toBe("check the file")
    expect(normalizeForLoopDetection("I'll look into this")).toBe("look into this")
    expect(normalizeForLoopDetection("I will investigate")).toBe("investigate")
    expect(normalizeForLoopDetection("Let's do something")).toBe("do something")
  })

  test("truncates to 200 chars", () => {
    const long = "a".repeat(300)
    expect(normalizeForLoopDetection(long)).toHaveLength(200)
  })

  test("identical inputs produce identical outputs", () => {
    const a = normalizeForLoopDetection("  Let me check if one was already created  ")
    const b = normalizeForLoopDetection("Let me check if one was already created")
    expect(a).toBe(b)
  })

  test("different inputs produce different outputs", () => {
    const a = normalizeForLoopDetection("Let me check the changelog")
    const b = normalizeForLoopDetection("I will try a different approach")
    expect(a).not.toBe(b)
  })

  test("collapses Japanese documentary-intent paraphrase noise", () => {
    const a = intentFingerprint(
      "判定不足の文書証拠を埋めるため、composeスキルを読み込みつつ現状のドキュメントとテストを確認します。",
    )
    const b = intentFingerprint(
      "判定で不足していた文書証拠を埋めるため、composeスキルと既存docsを確認してから一気に揃えます。",
    )
    const c = intentFingerprint(
      "ループ原因は「文書を作る」と宣言するだけで Write/Shell を実行していなかったこと。宣言を捨て、今すぐファイル作成とテスト実行に入ります。",
    )
    expect(a).toBe("intent:docs-evidence-fill")
    expect(a).toBe(b)
    expect(c).toBe("intent:docs-evidence-fill")
    expect(similarEnough(a, b)).toBe(true)
  })
})

describe("stepLoopFingerprint", () => {
  test("uses reasoning when assistant text is empty", () => {
    const fp = stepLoopFingerprint([
      { type: "reasoning", text: "不足証拠を埋めるため、既存docsとテストを確認します。" },
      { type: "text", text: "   ", synthetic: false },
    ])
    expect(fp.length).toBeGreaterThan(0)
    expect(fp).not.toContain("\0")
  })

  test("prefers text over reasoning when both exist", () => {
    const fp = stepLoopFingerprint([
      { type: "reasoning", text: "planning something else entirely about widgets" },
      { type: "text", text: "Writing the hearing log now", synthetic: false },
    ])
    expect(fp).toContain("writing the hearing log now")
  })
})

describe("detectTextLoop", () => {
  test("returns false when buffer too small", () => {
    expect(detectTextLoop(["a", "a"], 3)).toBe(false)
  })

  test("returns false when last N entries differ", () => {
    expect(detectTextLoop(["a", "b", "c"], 3)).toBe(false)
    expect(detectTextLoop(["a", "a", "b"], 3)).toBe(false)
  })

  test("returns true when last N entries are identical", () => {
    expect(detectTextLoop(["a", "a", "a"], 3)).toBe(true)
    expect(detectTextLoop(["x", "a", "a", "a"], 3)).toBe(true)
  })

  test("detects near-duplicate Japanese announcement loops", () => {
    const a = intentFingerprint(
      "不足証拠を埋めるため、composeスキルを読み込みつつ既存docsとテストを確認します。",
    )
    const b = intentFingerprint(
      "不足している文書証拠を埋めるため、composeスキルと既存docsを確認してから一気に揃えます。",
    )
    const c = intentFingerprint(
      "判定不足の文書証拠を埋めるため、composeスキルを読み込みつつ現状の docs とテストを確認します。",
    )
    expect(a.startsWith("intent:")).toBe(true)
    expect(detectTextLoop([a, b, c], 3)).toBe(true)
  })

  test("only checks the tail, not earlier entries", () => {
    expect(detectTextLoop(["b", "c", "a", "a", "a"], 3)).toBe(true)
    expect(detectTextLoop(["a", "a", "b", "b", "b"], 3)).toBe(true)
  })

  test("works with threshold of 2", () => {
    expect(detectTextLoop(["a", "a"], 2)).toBe(true)
    expect(detectTextLoop(["a", "b"], 2)).toBe(false)
  })
})

describe("text loop detection integration logic", () => {
  test("full detection flow: 3 identical triggers detection", () => {
    const buffer: string[] = []
    const texts = [
      "Let me check if one was already created earlier and update it.",
      "Let me check if one was already created earlier and update it.",
      "Let me check if one was already created earlier and update it.",
    ]

    let triggered = false
    for (const text of texts) {
      const normalized = normalizeForLoopDetection(text)
      buffer.push(normalized)
      if (buffer.length > TEXT_LOOP_BUFFER_SIZE) buffer.shift()

      if (buffer.length >= TEXT_LOOP_TRIGGER_COUNT) {
        if (detectTextLoop(buffer, TEXT_LOOP_TRIGGER_COUNT)) {
          triggered = true
          break
        }
      }
    }

    expect(triggered).toBe(true)
  })

  test("mixed texts do not trigger", () => {
    const buffer: string[] = []
    const texts = [
      "Let me check the file",
      "I found the changelog",
      "Let me update it now",
    ]

    let triggered = false
    for (const text of texts) {
      const normalized = normalizeForLoopDetection(text)
      buffer.push(normalized)
      if (buffer.length > TEXT_LOOP_BUFFER_SIZE) buffer.shift()

      if (buffer.length >= TEXT_LOOP_TRIGGER_COUNT) {
        if (detectTextLoop(buffer, TEXT_LOOP_TRIGGER_COUNT)) {
          triggered = true
        }
      }
    }

    expect(triggered).toBe(false)
  })

  test("recovery clears buffer and resets detection window", () => {
    const buffer: string[] = []
    let recoveryAttempts = 0
    const repeatedText = "The user wants me to create a ChangeLog file."

    // First 3 identical → trigger #1
    for (let i = 0; i < 3; i++) {
      buffer.push(normalizeForLoopDetection(repeatedText))
    }
    expect(detectTextLoop(buffer, TEXT_LOOP_TRIGGER_COUNT)).toBe(true)
    recoveryAttempts++
    buffer.length = 0 // clear on recovery

    // After recovery, buffer is empty — next identical doesn't trigger yet
    buffer.push(normalizeForLoopDetection(repeatedText))
    expect(detectTextLoop(buffer, TEXT_LOOP_TRIGGER_COUNT)).toBe(false)

    // Fill up again for second trigger
    buffer.push(normalizeForLoopDetection(repeatedText))
    buffer.push(normalizeForLoopDetection(repeatedText))
    expect(detectTextLoop(buffer, TEXT_LOOP_TRIGGER_COUNT)).toBe(true)
    recoveryAttempts++
    buffer.length = 0

    // Third trigger would exceed max
    for (let i = 0; i < 3; i++) {
      buffer.push(normalizeForLoopDetection(repeatedText))
    }
    expect(detectTextLoop(buffer, TEXT_LOOP_TRIGGER_COUNT)).toBe(true)
    expect(recoveryAttempts >= TEXT_LOOP_MAX_RECOVERY).toBe(true) // should terminate
  })

  test("recovery that succeeds does not escalate", () => {
    const buffer: string[] = []
    let recoveryAttempts = 0
    const repeatedText = "I am stuck in a loop"
    const differentText = "OK I will try something else"

    // 3 identical → trigger
    for (let i = 0; i < 3; i++) {
      buffer.push(normalizeForLoopDetection(repeatedText))
    }
    expect(detectTextLoop(buffer, TEXT_LOOP_TRIGGER_COUNT)).toBe(true)
    recoveryAttempts++
    buffer.length = 0

    // After recovery, model responds differently
    buffer.push(normalizeForLoopDetection(differentText))
    buffer.push(normalizeForLoopDetection("Now doing something useful"))
    buffer.push(normalizeForLoopDetection("Almost done"))
    expect(detectTextLoop(buffer, TEXT_LOOP_TRIGGER_COUNT)).toBe(false)

    // Recovery succeeded — counter stays at 1, no escalation
    expect(recoveryAttempts).toBe(1)
  })

  test("constants have expected values", () => {
    expect(TEXT_LOOP_BUFFER_SIZE).toBe(5)
    expect(TEXT_LOOP_TRIGGER_COUNT).toBe(3)
    expect(TEXT_LOOP_MAX_RECOVERY).toBe(2)
  })
})
