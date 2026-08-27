import { Locale } from "@/util"

/**
 * Cell budget for the ephemeral status message in the prompt footer. Sized so
 * the message plus the spinner still leaves room for `esc interrupt` and the
 * context counter on an 80-column terminal.
 */
export const STATUS_MESSAGE_MAX = 48

/**
 * The footer packs the spinner + status message onto the same row as the context
 * counter (`52.4K/960K (5%)`). A long server-supplied status string wrapped over
 * several lines and squeezed that row until the counter rendered clipped
 * (`52.4K/96`). Clamp the message — and flatten any newlines — so a status
 * string can never cost the counter its cells.
 */
export function clampStatusMessage(message: string | undefined) {
  if (!message) return undefined
  const flat = message.replace(/\s+/g, " ").trim()
  if (!flat) return undefined
  return Locale.truncate(flat, STATUS_MESSAGE_MAX)
}

/**
 * Bottom-left activity spinner. Session busy/retry always shows it.
 *
 * While idle, only real concurrent work (actors / child sessions) keeps it
 * moving. Leftover `in_progress` board rows alone must not — after a normal
 * wait-for-user stop, rate-limit halt, or goal that never set `stopReason`,
 * those rows stay stale and would otherwise spin forever.
 *
 * Infra child sessions (checkpoint-writer, etc.) also must not keep the parent
 * footer spinning after the main turn is idle — they are background bookkeeping.
 */
export function shouldShowSessionActivity(input: {
  statusType: string
  hasActiveActor: boolean
  hasActiveChild: boolean
}) {
  if (input.statusType !== "idle") return true
  if (input.hasActiveActor) return true
  if (input.hasActiveChild) return true
  return false
}

/** Background writer/title children — not user-visible "still working" on the parent. */
export function isInfraChildSession(input: { title?: string }) {
  const title = input.title ?? ""
  return (
    title.startsWith("checkpoint-writer:") ||
    title === "Auto Evolve" ||
    title === "Auto Dream" ||
    title === "Auto Distill"
  )
}

/** Sidebar task-row spinner: animate only while the session itself is busy. */
export function shouldSpinInProgressTask(input: { sessionIdle: boolean }) {
  return !input.sessionIdle
}
