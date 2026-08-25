import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import * as Scope from "@/reliability/scope"

const DESCRIPTION = [
  "Declare or clear the edit scope for this session.",
  "",
  "When reliability.scope is enabled, writes must stay inside allow_globs (if set)",
  "and outside deny_globs (plus default protected paths like .env).",
  "Call this before broad edits when the task should touch only specific areas.",
  "",
  "Pass clear=true to remove the session-level scope (config allow/deny still apply).",
].join("\n")

export const EditScopeTool = Tool.define(
  "edit_scope",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: z.object({
      allow_globs: z
        .array(z.string())
        .optional()
        .describe("Globs relative to the worktree that may be written (empty = no allowlist)."),
      deny_globs: z
        .array(z.string())
        .optional()
        .describe("Additional deny globs relative to the worktree."),
      clear: z.boolean().optional().describe("When true, clear the session-level edit scope."),
    }),
    execute: (
      params: { allow_globs?: string[]; deny_globs?: string[]; clear?: boolean },
      ctx: Tool.Context,
    ) =>
      Effect.sync(() => {
        if (params.clear) {
          Scope.clear(ctx.sessionID)
          return {
            title: "edit scope cleared",
            output:
              "Session edit scope cleared. Config allow_globs/deny_globs and default protected paths still apply.",
            metadata: { cleared: true, allow: [] as string[], deny: [] as string[] },
          }
        }
        const scope = Scope.set(ctx.sessionID, {
          allow: params.allow_globs ?? [],
          deny: params.deny_globs ?? [],
        })
        return {
          title: "edit scope set",
          output: [
            "Session edit scope updated:",
            `allow: ${scope.allow.length ? scope.allow.join(", ") : "(none)"}`,
            `deny: ${scope.deny.length ? scope.deny.join(", ") : "(none)"}`,
            "Default protected paths (.env, credentials, *secret*) remain denied.",
          ].join("\n"),
          metadata: { cleared: false, allow: scope.allow, deny: scope.deny },
        }
      }),
  }),
)
