import { doctor } from "./doctor"
import {
  candidatePaths,
  findConfigPath,
  fingerprint,
  gitWorktreeRoot,
  loadFromFile,
  loadFromGitmodules,
  loadFromPrimary,
  loadFromReposList,
  materialize,
  RepoWorkspaceError,
} from "./load"
import {
  canWrite,
  formatLocation,
  locate,
  resolveAbsolute,
  resolveRead,
  resolveWrite,
  rootOf,
} from "./resolve"
import { Access, Defaults, File, Kind, RepositoryConfig } from "./schema"
import * as SessionFingerprint from "./session-fingerprint"
import * as Runtime from "./runtime"
import { formatMatches, searchAcross } from "./search"
import {
  cloneCommands,
  deriveId,
  findReposListPath,
  missingClones,
  parseReposList,
  reposListToFile,
} from "./repos-list"
import { inspectAll, isSuperproject, parseGitmodules, readGitmodules } from "./gitmodules"

export {
  Access,
  Defaults,
  File,
  Kind,
  RepositoryConfig,
  RepoWorkspaceError,
  SessionFingerprint,
  Runtime,
  candidatePaths,
  canWrite,
  cloneCommands,
  deriveId,
  doctor,
  findConfigPath,
  findReposListPath,
  fingerprint,
  formatLocation,
  formatMatches,
  gitWorktreeRoot,
  inspectAll,
  isSuperproject,
  loadFromFile,
  loadFromGitmodules,
  loadFromPrimary,
  loadFromReposList,
  locate,
  materialize,
  missingClones,
  parseGitmodules,
  parseReposList,
  readGitmodules,
  reposListToFile,
  resolveAbsolute,
  resolveRead,
  resolveWrite,
  rootOf,
  searchAcross,
}

export type {
  DoctorIssue,
  DoctorReport,
  GitSnapshot,
  Info,
  Location,
  RepositoryDescriptor,
} from "./schema"

export type { ResolveReadResult, ResolveWriteResult } from "./resolve"
export type {
  SessionFingerprint as SessionFingerprintRecord,
  ReconcileResult,
} from "./session-fingerprint"
export type { SubmoduleState, GitmodulesEntry } from "./gitmodules"
export type { ReposListFile, ReposListLine } from "./repos-list"
