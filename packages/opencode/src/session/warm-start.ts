import path from "path"
import fs from "fs"
import { Effect } from "effect"
import { InstanceState } from "@/effect"
import { Instance } from "@/project/instance"
import { Database, eq, and, isNull, desc, asc } from "@/storage"
import { SessionTable, TodoTable } from "./session.sql"
import { isSystemSession } from "./auto-dream"
import { MessageV2 } from "./message-v2"
import type { Info } from "./session"
import { SessionID, MessageID, type SessionID as SessionIDType } from "./schema"

export type WarmMode = "summary" | "deep"

export const WARM_START_MARKER = "Soft continue (warm start)"

const BRIEF_MAX = 1800
const LAST_RESULT_MAX = 500
const ASSISTANT_SNIPPET_MAX = 400

const pendingBriefs = new Map<SessionIDType, string>()

export function registerBrief(sessionID: SessionIDType, brief: string) {
  pendingBriefs.set(sessionID, brief)
}

export function consumeBrief(sessionID: SessionIDType): string | undefined {
  const brief = pendingBriefs.get(sessionID)
  if (brief) pendingBriefs.delete(sessionID)
  return brief
}

export type WarmPlan = {
  title?: string
  contextFrom?: SessionIDType
  contextWatermark?: MessageID
  brief: string
}

export type WarmSource = Pick<Info, "id" | "title" | "time" | "summary">

export type WarmTodo = { content: string; status: string }

export type WarmBundle = {
  source: WarmSource
  lastAssistantText?: string
  todos: WarmTodo[]
  sessionLogTail?: string
  watermark?: MessageID
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return text.slice(0, max - 3) + "..."
}

function formatRelativeTime(updatedAt: number) {
  const delta = Date.now() - updatedAt
  if (delta < 60_000) return "just now"
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`
  return new Date(updatedAt).toISOString()
}

function sourceFromRow(row: typeof SessionTable.$inferSelect): WarmSource {
  const summary =
    row.summary_additions !== null || row.summary_deletions !== null || row.summary_files !== null
      ? {
          additions: row.summary_additions ?? 0,
          deletions: row.summary_deletions ?? 0,
          files: row.summary_files ?? 0,
          diffs: row.summary_diffs ?? undefined,
        }
      : undefined
  return {
    id: row.id,
    title: row.title,
    time: { updated: row.time_updated, created: row.time_created },
    summary,
  }
}

export function findContextWatermark(msgs: MessageV2.WithParts[]): MessageID | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i]
    if (msg.info.role !== "user") continue
    if (msg.parts.some((part) => part.type === "compaction" || part.type === "checkpoint")) {
      return msg.info.id
    }
  }
  return undefined
}

export function lastAssistantSnippet(msgs: MessageV2.WithParts[]): string | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i]
    if (msg.info.role !== "assistant") continue
    const text = msg.parts
      .filter((part): part is MessageV2.TextPart => part.type === "text" && !part.synthetic && !part.ignored)
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n")
    if (text) return truncate(text, ASSISTANT_SNIPPET_MAX)
  }
  return undefined
}

export function readSessionLogTail(directory: string, maxChars = LAST_RESULT_MAX): string | undefined {
  const dir = path.join(directory, ".oimo")
  if (!fs.existsSync(dir)) return undefined
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("oimo-session-") && name.endsWith(".md"))
    .map((name) => {
      const full = path.join(dir, name)
      return { full, mtime: fs.statSync(full).mtimeMs }
    })
    .toSorted((a, b) => b.mtime - a.mtime)
  const latest = files[0]
  if (!latest) return undefined
  const content = fs.readFileSync(latest.full, "utf8")
  const marker = "### Result"
  const idx = content.lastIndexOf(marker)
  if (idx === -1) return truncate(content.trim(), maxChars)
  const tail = content.slice(idx + marker.length).replace(/^[\r\n]+/, "").split("\n---")[0]?.trim()
  if (!tail) return undefined
  return truncate(tail, maxChars)
}

export function formatBrief(input: {
  mode: WarmMode
  directory: string
  bundle?: WarmBundle
}): string {
  const lines = [
    "<system-reminder>",
    WARM_START_MARKER + " from prior work in this directory.",
    `Working directory: ${input.directory}`,
  ]
  if (!input.bundle) {
    lines.push("No prior root session was found here — treat this as a fresh start.")
    lines.push("Use git status, files, and memory tools to inspect current state.")
    lines.push("</system-reminder>")
    return truncate(lines.join("\n"), BRIEF_MAX)
  }
  const source = input.bundle.source
  lines.push(`Source session: "${source.title}" (${formatRelativeTime(source.time.updated)})`)
  if (source.summary?.files) {
    lines.push(
      `Session diff snapshot: ${source.summary.files} file(s), +${source.summary.additions ?? 0}/-${source.summary.deletions ?? 0}`,
    )
  }
  const openTodos = input.bundle.todos.filter((todo) => todo.status === "pending" || todo.status === "in_progress")
  if (openTodos.length > 0) {
    lines.push(
      "Open todos:",
      ...openTodos.slice(0, 6).map((todo) => `- [${todo.status}] ${todo.content}`),
    )
  }
  if (input.bundle.lastAssistantText) {
    lines.push(`Last assistant message: ${input.bundle.lastAssistantText}`)
  }
  if (input.bundle.sessionLogTail) {
    lines.push(`Last logged result: ${input.bundle.sessionLogTail}`)
  }
  if (input.mode === "deep") {
    lines.push(
      input.bundle.watermark
        ? "Deep warm: compacted parent context is inherited up to the last checkpoint/compaction boundary."
        : "Deep warm: no compaction boundary found — summary only; inspect the workspace directly.",
    )
  }
  lines.push(
    "This brief may be stale. Verify with Read, git, and tools before acting.",
    "Do not assume full prior tool-call history is replayed in this session.",
    "</system-reminder>",
  )
  return truncate(lines.join("\n"), BRIEF_MAX)
}

function loadTodos(sessionID: SessionIDType): WarmTodo[] {
  return Database.use((db) =>
    db
      .select()
      .from(TodoTable)
      .where(eq(TodoTable.session_id, sessionID))
      .orderBy(asc(TodoTable.position))
      .all()
      .map((row) => ({ content: row.content, status: row.status })),
  )
}

export const findSourceSession = Effect.fnUntraced(function* (directory: string) {
  const project = Instance.project
  const rows = Database.use((db) =>
    db
      .select()
      .from(SessionTable)
      .where(and(eq(SessionTable.project_id, project.id), eq(SessionTable.directory, directory), isNull(SessionTable.parent_id)))
      .orderBy(desc(SessionTable.time_updated))
      .limit(32)
      .all(),
  )
  for (const row of rows) {
    const info = sourceFromRow(row)
    if (!isSystemSession(info)) return info
  }
  return undefined
})

export const collectBundle = Effect.fnUntraced(function* (source: WarmSource, directory: string) {
  const list = [...MessageV2.stream(source.id, { agentID: "main" })]
  return {
    source,
    lastAssistantText: lastAssistantSnippet(list),
    todos: loadTodos(source.id),
    sessionLogTail: readSessionLogTail(directory),
    watermark: findContextWatermark(list),
  } satisfies WarmBundle
})

export const plan = Effect.fnUntraced(function* (input: { mode: WarmMode; directory?: string }) {
  const directory = input.directory ?? (yield* InstanceState.directory)
  const source = yield* findSourceSession(directory)
  const bundle = source ? yield* collectBundle(source, directory) : undefined
  const brief = formatBrief({ mode: input.mode, directory, bundle })
  const title = source ? `Warm: ${truncate(source.title, 50)}` : undefined
  const deep = input.mode === "deep" && bundle?.watermark
  return {
    title,
    contextFrom: deep ? source!.id : undefined,
    contextWatermark: deep ? bundle!.watermark : undefined,
    brief,
  } satisfies WarmPlan
})
