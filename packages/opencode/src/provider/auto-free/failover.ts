import { isRetryableTransientError } from "@/session/retry"

/**
 * First-frame failover state machine (FCC ProviderExecutor §5.2).
 *
 * Commit = first non-empty protocol frame. After commit, never switch models.
 * Before commit, retryable failures advance to the next candidate.
 */

export type FailoverCandidate<T> = T

export type FailoverDecision =
  | { action: "commit" }
  | { action: "advance"; reason: string }
  | { action: "fail"; reason: string }

export function isCommitStreamEvent(event: { type: string; text?: string }): boolean {
  switch (event.type) {
    case "text-delta":
    case "reasoning-delta":
      return typeof event.text === "string" && event.text.length > 0
    case "tool-input-start":
    case "tool-call":
    case "tool-input-delta":
    case "file":
    case "source":
      return true
    default:
      return false
  }
}

export function classifyFailoverFailure(error: unknown, committed: boolean, hasNext: boolean): FailoverDecision {
  if (committed) return { action: "fail", reason: "committed" }
  if (!hasNext) return { action: "fail", reason: "no-candidates" }
  if (!isRetryableTransientError(error)) return { action: "fail", reason: "non-retryable" }
  return { action: "advance", reason: "retryable-pre-commit" }
}

/**
 * Pure walk of candidates. `attempt` runs one candidate and returns either
 * success, or throws. Caller supplies commit detection via `onEvent`.
 */
export async function runWithFailover<C, R>(input: {
  candidates: C[]
  attempt: (candidate: C, index: number, signal: { markCommitted: () => void; committed: () => boolean }) => Promise<R>
  onAdvance?: (from: C, to: C, index: number, reason: string) => void
}): Promise<R> {
  if (input.candidates.length === 0) throw new Error("Auto Model (free): no available free model candidates")

  let lastError: unknown
  for (let index = 0; index < input.candidates.length; index++) {
    const candidate = input.candidates[index]!
    let committed = false
    const signal = {
      markCommitted: () => {
        committed = true
      },
      committed: () => committed,
    }
    try {
      return await input.attempt(candidate, index, signal)
    } catch (error) {
      lastError = error
      const next = input.candidates[index + 1]
      const decision = classifyFailoverFailure(error, committed, next !== undefined)
      if (decision.action !== "advance" || !next) throw error
      input.onAdvance?.(candidate, next, index + 1, decision.reason)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
