import path from "node:path"
import { appendFile, mkdir } from "node:fs/promises"
import { Flag } from "@/flag/flag"
import { Log } from "@/util"

const log = Log.create({ service: "tui.session-log" })

export function formatSessionLogEntry(question: string, answer: string, time: number): string {
  return [
    `## ${new Date(time).toISOString()}`,
    ``,
    `### User`,
    ``,
    question.trim(),
    ``,
    `### oimo`,
    ``,
    answer.trim(),
    ``,
    `---`,
    ``,
  ].join("\n")
}

// Best-effort: a failed append must never break the TUI.
export function appendSessionLog(input: { question: string; answer: string; time: number }): Promise<void> {
  const file = Flag.MIMOCODE_LOG
  if (!file) return Promise.resolve()
  return (async () => {
    await mkdir(path.dirname(file), { recursive: true })
    await appendFile(file, formatSessionLogEntry(input.question, input.answer, input.time), "utf8")
  })().catch((error) => log.warn("append failed", { file, error: String(error) }))
}
