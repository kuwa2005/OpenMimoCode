import { Schema } from "effect"
import { zod } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"
import type { SubmoduleState } from "./gitmodules"

export const Access = Schema.Literals(["read-only", "read-write"]).annotate({
  description: "Whether tools may write inside this repository.",
})
export type Access = Schema.Schema.Type<typeof Access>

export const Kind = Schema.Literals(["git", "directory", "superproject", "submodule"]).annotate({
  description:
    "git = independent checkout. directory = non-git read target. superproject = .gitmodules host. submodule = child of a superproject.",
})
export type Kind = Schema.Schema.Type<typeof Kind>

export const RepositoryConfig = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()).annotate({
    description: "Stable repository id used in search results and plans (e.g. backend).",
  }),
  path: Schema.String.check(Schema.isNonEmpty()).annotate({
    description: "Absolute or relative path. Stored normalized as absolute after load.",
  }),
  role: Schema.optional(Schema.String).annotate({
    description: "Human-readable role within the system workspace.",
  }),
  access: Schema.optional(Access).annotate({
    description: "Defaults to read-write for git/submodule, read-only for directory/superproject.",
  }),
  kind: Schema.optional(Kind).annotate({
    description: "Defaults to git. Non-git paths require kind: directory.",
  }),
}).pipe(withStatics((s) => ({ zod: zod(s) })))
export type RepositoryConfig = Schema.Schema.Type<typeof RepositoryConfig>

export const Defaults = Schema.Struct({
  allow_unregistered_reads: Schema.optional(Schema.Boolean).annotate({
    description: "When false (default), reads outside registered roots need external_directory.",
  }),
  allow_unregistered_writes: Schema.optional(Schema.Boolean).annotate({
    description: "When false (default), writes outside registered roots are denied.",
  }),
  require_cross_repo_plan: Schema.optional(Schema.Boolean).annotate({
    description: "When true (default), multi-repo writes require an explicit change plan.",
  }),
}).pipe(withStatics((s) => ({ zod: zod(s) })))
export type Defaults = Schema.Schema.Type<typeof Defaults>

export const File = Schema.Struct({
  version: Schema.Literal(1),
  name: Schema.String.check(Schema.isNonEmpty()).annotate({
    description: "Display name for this system workspace (multiple repositories).",
  }),
  primary: Schema.String.check(Schema.isNonEmpty()).annotate({
    description: "Repository id that is the primary / launch target.",
  }),
  repositories: Schema.Array(RepositoryConfig).check(Schema.isMinLength(1)),
  defaults: Schema.optional(Defaults),
}).pipe(withStatics((s) => ({ zod: zod(s) })))
export type File = Schema.Schema.Type<typeof File>

export type GitSnapshot = {
  branch?: string
  head?: string
  remoteNames: string[]
  dirty: boolean
}

export type RepositoryDescriptor = {
  id: string
  rootPath: string
  canonicalPath: string
  kind: Kind
  role?: string
  access: Access
  git?: GitSnapshot
  configuredPath: string
  submodule?: SubmoduleState
}

export type Info = {
  name: string
  configPath: string
  primaryRepositoryId: string
  repositories: Map<string, RepositoryDescriptor>
  layout?: "siblings" | "superproject"
  superprojectId?: string
  submodules?: SubmoduleState[]
  defaults: {
    allowUnregisteredReads: boolean
    allowUnregisteredWrites: boolean
    requireCrossRepoPlan: boolean
  }
}

export type Location = {
  repositoryId: string
  relativePath: string
}

export type DoctorIssue = {
  severity: "error" | "warning"
  code: string
  message: string
  repositoryId?: string
}

export type DoctorReport = {
  ok: boolean
  issues: DoctorIssue[]
  repositoryCount: number
  primaryRepositoryId: string
  name: string
  layout?: "siblings" | "superproject"
}
