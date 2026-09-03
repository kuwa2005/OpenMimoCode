import type { LearnedRule } from "./types"

export function ruleIdFromText(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
  return slug || "friction-rule"
}

export function similarRule(rules: LearnedRule[], text: string): LearnedRule | undefined {
  const key = normalize(text)
  return rules.find((r) => {
    if (r.status === "disabled") return false
    const other = normalize(r.text)
    if (other === key) return true
    if (shareUiVerify(key) && shareUiVerify(other)) return true
    return tokenOverlap(key, other) >= 0.6
  })
}

export function upsertRule(rules: LearnedRule[], next: LearnedRule): LearnedRule[] {
  const idx = rules.findIndex((r) => r.id === next.id)
  if (idx < 0) return [...rules, next]
  return rules.map((r, i) => (i === idx ? next : r))
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/mobile|スマホ|スマートフォン/g, "mobile")
    .replace(/desktop|pc|パソコン/g, "desktop")
    .replace(/確認|verify|verification/g, "verify")
    .replace(/ui変更|画面変更|表示変更/g, "ui-change")
    .replace(/\s+/g, "")
}

function shareUiVerify(text: string): boolean {
  return /ui-change/.test(text) && /verify|mobile|viewport/.test(text)
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split("-").filter((t) => t.length > 1))
  const tb = new Set(b.split("-").filter((t) => t.length > 1))
  if (ta.size === 0 || tb.size === 0) return 0
  let hit = 0
  for (const t of ta) if (tb.has(t)) hit++
  return hit / Math.max(ta.size, tb.size)
}
