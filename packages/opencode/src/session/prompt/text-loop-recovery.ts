export const TEXT_LOOP_BUFFER_SIZE = 5
export const TEXT_LOOP_TRIGGER_COUNT = 3
export const TEXT_LOOP_MAX_RECOVERY = 2
export const GOAL_REENTRY_STREAK_SOFT = 3
export const GOAL_REENTRY_STREAK_HARD = 6
/** Consecutive goal re-entries without a real (non-synthetic) user turn. */
export const GOAL_REENTRY_NO_USER_HARD = 5
/** think-only auto-continues allowed while autonomy goal is still in hearing. */
export const INVALID_OUTPUT_HEARING_LIMIT = 2
/** Consecutive finished steps with zero tool calls (Cursor announcement loops). */
export const NO_TOOL_STREAK_SOFT = 2
export const NO_TOOL_STREAK_HARD = 4
/** Consecutive docs-evidence announcement fingerprints without tools. */
export const DOCS_INTENT_STREAK_SOFT = 2

/**
 * Assistant text that means "hand control back to the human" — stop the autonomy
 * / rate-limit auto-kick loop instead of burning more API calls.
 */
export function isAwaitingUserOrDone(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const lower = t.toLowerCase()
  if (
    /(確認|指示|入力|動作確認)を?(お)?待ち|確認待ち|待機(して|します|中)|human\s*input/i.test(t)
  ) {
    return true
  }
  if (/お知らせください|必要でしたらお知らせ/.test(t)) {
    return true
  }
  if (
    /実装完了|完了しています|(全作業|すべて|全て|両タスク).{0,20}完了|作業完了を確認|全作業完了|両タスク完了済み/.test(
      t,
    )
  ) {
    return true
  }
  if (
    /awaiting\s*(your\s*)?(input|instructions?|orders?|confirmation)|waiting\s+for\s+(your\s+)?(input|instructions?|orders?|next\s+step|confirmation|verification|review)/i.test(
      t,
    )
  ) {
    return true
  }
  if (
    /\b(all\s+tasks?\s+(are\s+)?(done|complete|finished)|work\s+is\s+(done|complete)|task\s+is\s+complete|implementation is complete|nothing\s+further|no\s+further\s+action)\b/i.test(
      lower,
    )
  ) {
    return true
  }
  return false
}

/** Plain assistant text (non-synthetic) for completion / wait detection. */
export function assistantVisibleText(
  parts: ReadonlyArray<{ type: string; text?: string; synthetic?: boolean; ignored?: boolean }>,
): string {
  return parts
    .filter((p) => p.type === "text" && !p.synthetic && !p.ignored)
    .map((p) => p.text ?? "")
    .join("\n")
    .trim()
}

/** Synthetic try-best pause — the user request is unfinished even if earlier text sounded done. */
export function hasTryBestPause(
  parts: ReadonlyArray<{
    type: string
    text?: string
    metadata?: { origin?: { kind?: string } }
  }>,
): boolean {
  return parts.some((part) => {
    if (part.type !== "text") return false
    if (part.metadata?.origin?.kind === "try_best") return true
    return part.text?.startsWith("Try-best loop detected") ?? false
  })
}

export function assistantSignalsDone(
  parts: ReadonlyArray<{
    type: string
    text?: string
    synthetic?: boolean
    ignored?: boolean
    metadata?: { origin?: { kind?: string } }
  }>,
): boolean {
  if (hasTryBestPause(parts)) return false
  return isAwaitingUserOrDone(assistantVisibleText(parts))
}

export function normalizeForLoopDetection(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^(let me |i'll |i will |let's |まず|では|それでは)/i, "")
    .replace(/[「」『』【】]/g, "")
    .slice(0, 200)
}

const INTENT_MARKERS = [
  "hearing",
  "ヒアリング",
  "文書証拠",
  "documentary",
  "compose",
  "specs/",
  "reports/",
  "plans/",
  "テスト",
  "確認",
  "作成",
  "埋める",
  "不足",
  "拡張テスト",
  "実行",
  "docs",
  "skill",
  "一気に",
  "揃",
  "現状",
] as const

/**
 * Stable signature for "I will fill the missing docs/tests" announcement loops.
 * Paraphrases that share gap + docs + action collapse to one key.
 */
export function intentFingerprint(text: string): string {
  const base = normalizeForLoopDetection(text)
  const docs =
    base.includes("文書証拠") ||
    base.includes("documentary") ||
    base.includes("hearing") ||
    base.includes("ヒアリング") ||
    base.includes("specs/") ||
    base.includes("reports/") ||
    base.includes("plans/") ||
    base.includes("文書") ||
    base.includes("仕様") ||
    base.includes("レポート")
  const gap =
    base.includes("不足") ||
    base.includes("missing") ||
    base.includes("判定") ||
    base.includes("ループ") ||
    base.includes("宣言")
  const action =
    base.includes("埋める") ||
    base.includes("作成") ||
    base.includes("確認") ||
    base.includes("揃") ||
    base.includes("実行") ||
    base.includes("一気に") ||
    base.includes("書き") ||
    base.includes("進め") ||
    base.includes("入ります")
  const tooling =
    base.includes("compose") ||
    base.includes("docs") ||
    base.includes("テスト") ||
    base.includes("skill") ||
    base.includes("現状") ||
    base.includes("write") ||
    base.includes("shell")
  if ((docs || gap) && action && tooling) return "intent:docs-evidence-fill"
  if (docs && action) return "intent:docs-evidence-fill"

  const hits = INTENT_MARKERS.filter((m) => base.includes(m.toLowerCase()) || base.includes(m))
  if (hits.length >= 3) return `intent:${[...hits].sort().join("|")}`
  return base
}

function tokenSet(value: string) {
  const spaced = value.split(/\s+/).filter((t) => t.length > 1)
  if (spaced.length >= 4) return new Set(spaced)
  const compact = value.replace(/\s+/g, "")
  if (compact.length < 2) return new Set(compact ? [compact] : [])
  const grams: string[] = []
  for (let i = 0; i < compact.length - 1; i++) grams.push(compact.slice(i, i + 2))
  return new Set(grams)
}

/** Near-duplicate detection for paraphrased announcement loops. */
export function similarEnough(a: string, b: string, threshold = 0.55): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.startsWith("intent:") && b.startsWith("intent:") && a === b) return true
  const left = tokenSet(a.startsWith("intent:") ? a.slice(7) : a)
  const right = tokenSet(b.startsWith("intent:") ? b.slice(7) : b)
  if (left.size === 0 || right.size === 0) return false
  let inter = 0
  for (const token of left) if (right.has(token)) inter++
  const union = left.size + right.size - inter
  return union > 0 && inter / union >= threshold
}

export function detectTextLoop(buffer: string[], triggerCount: number): boolean {
  if (buffer.length < triggerCount) return false
  const tail = buffer.slice(-triggerCount)
  if (tail.every((t) => t === tail[0])) return true
  return tail.every((t) => similarEnough(t, tail[0]))
}

export function stepLoopFingerprint(parts: ReadonlyArray<{
  type: string
  text?: string
  synthetic?: boolean
  ignored?: boolean
  tool?: string
  state?: { input?: unknown }
}>): string {
  const text = parts
    .filter((p) => p.type === "text" && !p.synthetic && !p.ignored)
    .map((p) => p.text ?? "")
    .join(" ")
    .trim()
  const reasoning = parts
    .filter((p) => p.type === "reasoning")
    .map((p) => p.text ?? "")
    .join(" ")
    .trim()
  // Cursor often emits only reasoning ("Thought:") with empty assistant text.
  const body = text || reasoning
  if (!body) return ""
  const toolSig = parts
    .filter((p) => p.type === "tool")
    .map((p) => `${p.tool}:${JSON.stringify(p.state && "input" in p.state ? p.state.input : "")}`)
    .join("|")
  return intentFingerprint(body) + (toolSig ? `\0${toolSig}` : "")
}

export const RECOVERY_PROMPT_MILD = `<system-reminder>
LOOP DETECTED: Your last several outputs were identical. You are stuck in a repetitive pattern.

STOP what you are doing and take a DIFFERENT approach:
- If you were about to call a tool, try a different tool or different arguments
- If you were planning an action, reconsider and pick an alternative strategy
- If you are blocked, explain what's blocking you and ask the user for help

Do NOT repeat the same text or action again.
</system-reminder>`

export const RECOVERY_PROMPT_STRONG = `<system-reminder>
CRITICAL: You are STILL stuck in a loop after a previous recovery attempt.

Your previous approach has failed repeatedly. You MUST:
1. Abandon your current plan entirely
2. State what you were trying to do and why it failed
3. Ask the user for guidance on how to proceed

If you repeat the same output again, the session will be terminated.
</system-reminder>`

export const RECOVERY_PROMPT_DOCS_FORCE = `<system-reminder>
CRITICAL INTENT LOOP: You keep announcing that you will create hearing logs / specs / test reports, but you are not calling tools.

Your FIRST action this turn MUST be a concrete tool call:
1. write or edit — create the missing files under specs/ plans/ reports/
2. bash — run the verification command

Do NOT reply with only reasoning or another plan. Call a tool now.
</system-reminder>`
