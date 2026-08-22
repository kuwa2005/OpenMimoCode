/**
 * East-Asian terminals (esp. JA Windows Terminal / WSL) often draw Unicode
 * arrows and dashes as 2 cells, while Bun.stringWidth / OpenTUI treat them as
 * 1. That 1-cell drift drops or corrupts the following CJK glyphs (e.g. 無
 * after `→`). Replace ambiguous-width chrome with ASCII before paint.
 *
 * Only for display — never mutate persisted message content.
 */
const REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/→|⟶|➜|➔|➙|➝|➞|↳|↪/g, "->"],
  [/⇒|⟹/g, "=>"],
  [/←|⟵|↩/g, "<-"],
  [/↔|⟷/g, "<->"],
  [/—|–|―/g, "-"],
  [/·|•|●|◆|▪/g, "|"],
]

export function sanitizeDisplayText(text: string) {
  let out = text
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out
}
