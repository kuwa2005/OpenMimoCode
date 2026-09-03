import { recordRecovery } from "./log"
import {
  afterRateLimitRetrySent,
  nextRateLimitRecoverState,
  planRateLimitRecover,
  type RateLimitRecoverEntry,
  type RateLimitRecoverPlan,
} from "./rate-limit"

export type RateLimitRecoveryResult =
  | { action: "noop" }
  | { action: "skip_done" }
  | { action: "stop_max" }
  | { action: "schedule"; plan: Extract<RateLimitRecoverPlan, { action: "schedule" }>; state: RateLimitRecoverEntry }

export function createRateLimitRecoveryCoordinator() {
  const states = new Map<string, RateLimitRecoverEntry>()
  const pendingTimers = new Set<string>()

  return {
    getState(sessionID: string) {
      return states.get(sessionID)
    },

    hasPendingTimer(sessionID: string) {
      return pendingTimers.has(sessionID)
    },

    setPendingTimer(sessionID: string, pending: boolean) {
      if (pending) pendingTimers.add(sessionID)
      else pendingTimers.delete(sessionID)
    },

    onSessionError(input: {
      sessionID: string
      now: number
      source: "tui"
      assistantDoneOrWaiting?: boolean
    }): RateLimitRecoveryResult {
      const plan = planRateLimitRecover({
        state: states.get(input.sessionID),
        now: input.now,
        hasPendingTimer: pendingTimers.has(input.sessionID),
        assistantDoneOrWaiting: input.assistantDoneOrWaiting,
      })

      if (plan.action === "skip_done") {
        recordRecovery({ event: "rate_limit.skip_done", sessionID: input.sessionID, source: input.source, plan })
        return { action: "skip_done" }
      }

      if (plan.action === "ignore_burst") {
        recordRecovery({ event: "rate_limit.burst_ignored", sessionID: input.sessionID, source: input.source, plan })
        return { action: "noop" }
      }

      if (plan.action === "ignore_pending") {
        recordRecovery({ event: "rate_limit.pending_ignored", sessionID: input.sessionID, source: input.source, plan })
        return { action: "noop" }
      }

      if (plan.action === "stop_max") {
        recordRecovery({ event: "rate_limit.stop_max", sessionID: input.sessionID, source: input.source, plan })
        return { action: "stop_max" }
      }

      const state = nextRateLimitRecoverState(states.get(input.sessionID), input.now)
      states.set(input.sessionID, state)
      recordRecovery({
        event: "rate_limit.scheduled",
        sessionID: input.sessionID,
        source: input.source,
        plan,
        attempt: plan.attempt,
        delayMs: plan.delayMs,
      })
      return { action: "schedule", plan, state }
    },

    markRetrySent(sessionID: string) {
      const entry = states.get(sessionID)
      if (!entry) return
      states.set(sessionID, afterRateLimitRetrySent(entry))
      recordRecovery({
        event: "rate_limit.retry_sent",
        sessionID,
        source: "tui",
        attempt: entry.attempts + 1,
      })
    },

    clear(sessionID: string, reason: string) {
      pendingTimers.delete(sessionID)
      if (!states.has(sessionID)) return
      states.delete(sessionID)
      recordRecovery({ event: "rate_limit.cleared", sessionID, source: "tui", reason })
    },

    onIdle(sessionID: string) {
      if (pendingTimers.has(sessionID)) return
      if (!states.has(sessionID)) return
      states.delete(sessionID)
      recordRecovery({ event: "rate_limit.cleared", sessionID, source: "tui", reason: "session_idle" })
    },
  }
}
