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
 * While idle, only real concurrent work (spawned actors / child sessions) keeps
 * it moving. The session's own `main` registry row is not concurrent work —
 * `session_status` already represents that turn. It is registered `pending` at
 * session create and never goes idle until process restart, so treating it as
 * live work would spin forever after a wait-for-user stop.
 *
 * Leftover `in_progress` board rows alone must not either — after a normal
 * wait-for-user stop, rate-limit halt, or goal that never set `stopReason`,
 * those rows stay stale.
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

/** The session's own main row — covered by session_status, not by actor liveness. */
export function isSessionMainActor(actor: { actor_id?: string; mode?: string }) {
  return actor.mode === "main" || actor.actor_id === "main"
}

/** Spawned peer/subagent still pending or running. `main` never counts. */
export function isConcurrentActiveActor(actor: { actor_id?: string; mode?: string; status: string }) {
  if (isSessionMainActor(actor)) return false
  return actor.status === "pending" || actor.status === "running"
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
