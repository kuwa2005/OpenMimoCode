import type { MessageV2 } from "@/session/message-v2"
import { isRecord } from "@/util/record"

export const EDIT_TOOLS = new Set(["edit", "write", "apply_patch", "multiedit", "notebook_edit", "str_replace"])

/** Commands that count as verification evidence when they exit 0. */
export const VERIFY_COMMAND =
  /(?:^|[;&|]\s*|\s)(?:bun\s+(?:test|typecheck|run\s+(?:test|typecheck|lint|build))|npm\s+(?:test|run\s+(?:test|typecheck|lint|build))|pnpm\s+(?:test|run\s+(?:test|typecheck|lint|build))|yarn\s+(?:test|run\s+(?:test|typecheck|lint|build))|pytest\b|python(?:3)?\s+-m\s+pytest\b|cargo\s+(?:test|check|clippy|build)\b|go\s+test\b|make\s+(?:test|check|lint|build)\b|tsc\b)/i

export type EvidenceReport = {
  fresh: boolean
  edited: boolean
  lastEditAt?: number
  lastEditTools: string[]
  verifyCommand?: string
  verifyAt?: number
  reason: string
}

type ToolLike = {
  tool: string
  state: {
    status: string
    input?: Record<string, unknown>
    output?: string
    error?: string
    metadata?: Record<string, unknown>
    time?: { start?: number; end?: number }
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function commandOf(part: ToolLike) {
  return text(part.state.input?.command) ?? text(part.state.input?.cmd)
}

function endTime(part: ToolLike) {
  return part.state.time?.end ?? part.state.time?.start ?? 0
}

function exitOk(part: ToolLike) {
  if (part.state.status !== "completed") return false
  const meta = part.state.metadata
  if (meta && "exit" in meta) return meta.exit === 0
  return true
}

function toolParts(msgs: MessageV2.WithParts[]): ToolLike[] {
  return msgs.flatMap((msg) =>
    msg.parts.flatMap((part) => {
      if (part.type !== "tool") return []
      return [
        {
          tool: part.tool,
          state: part.state as ToolLike["state"],
        },
      ]
    }),
  )
}

/**
 * Evidence is fresh when either no edits happened, or a verification command
 * completed with exit 0 after the last edit. Claims in assistant prose alone
 * never satisfy this gate.
 */
export function evaluate(msgs: MessageV2.WithParts[]): EvidenceReport {
  const parts = toolParts(msgs)
  const edits = parts.filter((part) => EDIT_TOOLS.has(part.tool) && part.state.status === "completed")
  if (edits.length === 0) {
    return {
      fresh: true,
      edited: false,
      lastEditTools: [],
      reason: "No completed edits in the transcript; verification evidence is not required.",
    }
  }

  const lastEdit = edits.reduce((best, part) => (endTime(part) >= endTime(best) ? part : best))
  const lastEditAt = endTime(lastEdit)
  const lastEditTools = [...new Set(edits.map((part) => part.tool))]

  const verifies = parts.filter((part) => {
    if (part.tool !== "bash") return false
    if (!exitOk(part)) return false
    const command = commandOf(part)
    if (!command || !VERIFY_COMMAND.test(command)) return false
    return endTime(part) >= lastEditAt
  })

  if (verifies.length === 0) {
    return {
      fresh: false,
      edited: true,
      lastEditAt,
      lastEditTools,
      reason: [
        "Evidence freshness failed: the transcript has completed edits but no successful verification command after the last edit.",
        `Last edit tools: ${lastEditTools.join(", ")}.`,
        "Run a real check now (e.g. bun test / bun typecheck / npm test) and only then claim completion.",
      ].join(" "),
    }
  }

  const verify = verifies.reduce((best, part) => (endTime(part) >= endTime(best) ? part : best))
  return {
    fresh: true,
    edited: true,
    lastEditAt,
    lastEditTools,
    verifyCommand: commandOf(verify),
    verifyAt: endTime(verify),
    reason: "Fresh verification evidence exists after the last edit.",
  }
}

export function describeMissing(report: EvidenceReport) {
  return report.reason
}

/** True when metadata looks like a bash exit record with non-zero status. */
export function failedExit(metadata: unknown) {
  if (!isRecord(metadata) || !("exit" in metadata)) return false
  return metadata.exit !== 0
}
