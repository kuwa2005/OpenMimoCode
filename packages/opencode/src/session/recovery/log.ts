import path from "path"
import fs from "fs/promises"
import { Global } from "@/global"
import { Log } from "@/util"
import type { RateLimitRecoverPlan } from "./rate-limit"

const log = Log.create({ service: "session.recovery" })

export type RecoverySource = "tui" | "server" | "processor"

export type RecoveryLogEvent =
  | "error.publish_suppressed"
  | "rate_limit.burst_ignored"
  | "rate_limit.pending_ignored"
  | "rate_limit.scheduled"
  | "rate_limit.retry_sent"
  | "rate_limit.stop_max"
  | "rate_limit.cleared"

const journalPath = () => path.join(Global.Path.data, "recovery", "events.jsonl")

export function recordRecovery(input: {
  event: RecoveryLogEvent
  sessionID: string
  source: RecoverySource
  plan?: RateLimitRecoverPlan
  attempt?: number
  delayMs?: number
  reason?: string
}) {
  const extra = {
    sessionID: input.sessionID,
    source: input.source,
    ...(input.plan ? { plan: input.plan.action } : {}),
    ...(input.attempt != null ? { attempt: input.attempt } : {}),
    ...(input.delayMs != null ? { delayMs: input.delayMs } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  }
  log.info(input.event, extra)
  void appendJournal({ ts: Date.now(), ...input, ...extra })
}

async function appendJournal(line: Record<string, unknown>) {
  const filePath = journalPath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const file = Bun.file(filePath)
  const prev = (await file.exists()) ? await file.text() : ""
  await Bun.write(filePath, prev + JSON.stringify(line) + "\n")
}
