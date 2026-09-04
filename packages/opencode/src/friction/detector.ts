import type { LearnedRule } from "./types"

export type SignalKind =
  | "temporary"
  | "disable_rule"
  | "rejection"
  | "revert"
  | "repeat_adjustment"
  | "added_constraint"
  | "verification_ask"
  | "bug_report"
  | "manual_fix_hint"
  | "none"

export type DetectedSignal = {
  kind: SignalKind
  matched: string[]
  score: number
}

const TEMPORARY_RE =
  /今回だけ|一時的に|仮で|テスト用|デモ用|この画面だけ|この顧客だけ|今だけ|\bonly\s+this\b|\btemporarily\b|\bfor\s+now\b/i

const DISABLE_RE =
  /今後(その|この)?(確認|ルール)?はいらない|やらなくていい|そのルールは今回だけ|毎回.{0,12}なくていい|もう覚えなくて|ルールを(無効|削除|捨て)|forget\s+(that|this)\s+rule|don'?t\s+(always|need\s+to)\s+/i

const REJECTION_RE = /違う|そうじゃない|意図と違う|これは違う|\bwrong\b|\bincorrect\b|not\s+what|i\s+said/i

const REVERT_RE = /元に戻して|前の方が|戻して|\brevert\b|\bundo\b/i

const REPEAT_RE =
  /まだ小さい|もっと大きく|まだ大きい|もっと小さく|still\s+too|again|やり直し|また|もう一度|まだ.{0,8}(足り|小さい|大きい|狭い|広い)/i

const ADDED_RE =
  /(も|まで)(付けて|確認|入れて|対応)|スマホ|モバイル|mobile|viewport|バリデーション|外部ライブラリ|使わないで|Playwright|Excel|文字化け|レスポンシブ|ブラウザで確認/i

const VERIFY_ASK_RE = /確認した[？?]|Playwrightで|テストした[？?]|実画面|ブラウザで見/i

const BUG_RE =
  /崩れてる|崩れている|ログインできない|500|動かない|バグ|壊れて|表示されない|エラーになる|文字化け|できない/i

const MANUAL_FIX_RE = /自分で直|手動で直|手で直した|I\s+fixed|manually\s+fixed/i

export function detectSignals(userText: string): DetectedSignal {
  const matched: string[] = []
  const tryMatch = (kind: SignalKind, re: RegExp, score: number): DetectedSignal | undefined => {
    const m = userText.match(re)
    if (!m) return
    matched.push(m[0])
    return { kind, matched: [...matched], score }
  }

  return (
    tryMatch("temporary", TEMPORARY_RE, 0.95) ??
    tryMatch("disable_rule", DISABLE_RE, 0.9) ??
    tryMatch("repeat_adjustment", REPEAT_RE, 0.85) ??
    tryMatch("revert", REVERT_RE, 0.8) ??
    tryMatch("rejection", REJECTION_RE, 0.8) ??
    tryMatch("verification_ask", VERIFY_ASK_RE, 0.75) ??
    tryMatch("bug_report", BUG_RE, 0.7) ??
    tryMatch("manual_fix_hint", MANUAL_FIX_RE, 0.65) ??
    tryMatch("added_constraint", ADDED_RE, 0.6) ?? { kind: "none", matched: [], score: 0 }
  )
}

/** True when user message looks like corrective / friction feedback (not first-turn ask). */
export function isHumanUserFeedback(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (t.startsWith("<system-reminder>")) return false
  if (t.startsWith("<actor-notification>")) return false
  if (t.startsWith("Previous turn was paused by try-best")) return false
  if (t.startsWith("Previous turn hit a soft provider rate limit")) return false
  if (t.startsWith("The previous turn was paused by try-best")) return false
  return true
}

export function looksLikeFriction(userText: string, priorUserCount: number): boolean {
  if (!isHumanUserFeedback(userText)) return false
  if (priorUserCount < 1) {
    // First turn can still be temporary preference ("今回だけ赤くして")
    const signal = detectSignals(userText)
    return signal.kind === "temporary" || signal.kind === "disable_rule"
  }
  return detectSignals(userText).kind !== "none"
}

export function ruleMentionsVerification(rules: LearnedRule[]): boolean {
  return rules.some(
    (r) =>
      r.status !== "disabled" &&
      /mobile|スマホ|viewport|playwright|実画面|確認|verify|responsive|ブラウザ/i.test(r.text),
  )
}

export function ruleMentionsUi(rules: LearnedRule[]): boolean {
  return rules.some((r) => r.status !== "disabled" && /ui|画面|layout|カード|表示/i.test(r.text))
}
