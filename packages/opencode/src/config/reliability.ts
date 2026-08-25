import { Schema } from "effect"
import { zod } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"
import { Flag } from "@/flag/flag"

export * as ConfigReliability from "./reliability"

export const Info = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable the reliability harness (evidence freshness, existence/claim checks, loop convergence, edit scope). Defaults to on unless MIMOCODE_DISABLE_RELIABILITY=1 or enabled:false.",
  }),
  evidence: Schema.optional(Schema.Boolean).annotate({
    description:
      "Require fresh verification command evidence after edits before goal stop may complete. Defaults to true when reliability is enabled.",
  }),
  existence: Schema.optional(Schema.Boolean).annotate({
    description:
      "Reject bash claims that reference nonexistent package scripts or local source paths. Defaults to true when reliability is enabled.",
  }),
  loop: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enable try-best loop convergence pausing without MIMOCODE_ENABLE_TRY_BEST_HANDOFF. Defaults to true when reliability is enabled.",
  }),
  scope: Schema.optional(Schema.Boolean).annotate({
    description:
      "Enforce edit allow/deny globs (config + edit_scope tool + default protected paths). Defaults to true when reliability is enabled.",
  }),
  allow_globs: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description:
      "When non-empty, writes outside these globs (relative to worktree) are rejected. Empty means no allowlist restriction.",
  }),
  deny_globs: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Additional deny globs merged with default protected paths (.env, credentials, etc.).",
  }),
}).pipe(withStatics((s) => ({ zod: zod(s) })))

export type Info = Schema.Schema.Type<typeof Info>

export type Feature = "evidence" | "existence" | "loop" | "scope"

/** Master switch: on by default; opt out via config or MIMOCODE_DISABLE_RELIABILITY. */
export function enabled(cfg: { reliability?: Info }): boolean {
  if (Flag.MIMOCODE_DISABLE_RELIABILITY) return false
  if (cfg.reliability?.enabled === false) return false
  return true
}

/** Per-feature switch; defaults to on when the harness is enabled. */
export function feature(cfg: { reliability?: Info }, name: Feature): boolean {
  if (!enabled(cfg)) return false
  const value = cfg.reliability?.[name]
  return value !== false
}
