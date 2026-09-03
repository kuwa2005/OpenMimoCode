import * as fs from "fs"
import type { DoctorIssue, DoctorReport, Info } from "./schema"
import { gitWorktreeRoot } from "./load"

export function doctor(info: Info): DoctorReport {
  const issues: DoctorIssue[] = []

  const primary = info.repositories.get(info.primaryRepositoryId)
  if (!primary) {
    issues.push({
      severity: "error",
      code: "primary_missing",
      message: `Primary repository "${info.primaryRepositoryId}" is not registered`,
      repositoryId: info.primaryRepositoryId,
    })
  } else if (primary.kind === "superproject") {
    issues.push({
      severity: "warning",
      code: "primary_is_superproject",
      message:
        "Primary is the superproject. Prefer a submodule for application code; treat the superproject as workspace management only.",
      repositoryId: primary.id,
    })
  }

  if (!fs.existsSync(info.configPath)) {
    issues.push({
      severity: "error",
      code: "config_missing",
      message: `Config file missing: ${info.configPath}`,
    })
  }

  for (const repo of info.repositories.values()) {
    if (repo.kind === "submodule") {
      const state = repo.submodule
      if (!state) {
        issues.push({
          severity: "warning",
          code: "submodule_state_unknown",
          message: `No submodule inspection data for "${repo.id}"`,
          repositoryId: repo.id,
        })
        continue
      }
      for (const warning of state.warnings) {
        issues.push({
          severity: "warning",
          code: state.initialized
            ? state.commitMismatch
              ? "submodule_commit_mismatch"
              : state.behindTrackingBranch
                ? "submodule_behind_tracking"
                : "submodule_warning"
            : "submodule_uninitialized",
          message: warning,
          repositoryId: repo.id,
        })
      }
      if (!state.initialized) {
        issues.push({
          severity: "error",
          code: "submodule_uninitialized",
          message: `Submodule "${repo.id}" is not initialized. Run with user approval: git submodule update --init -- ${state.path}`,
          repositoryId: repo.id,
        })
      }
      continue
    }

    if (!fs.existsSync(repo.canonicalPath) || !fs.statSync(repo.canonicalPath).isDirectory()) {
      issues.push({
        severity: "error",
        code: "path_missing",
        message: `Path missing or not a directory: ${repo.canonicalPath}`,
        repositoryId: repo.id,
      })
      continue
    }

    if (repo.kind === "git" || repo.kind === "superproject") {
      const root = gitWorktreeRoot(repo.canonicalPath)
      if (!root) {
        issues.push({
          severity: "error",
          code: "not_a_git_repository",
          message: `No longer a git repository: ${repo.canonicalPath}`,
          repositoryId: repo.id,
        })
      } else if (root !== repo.canonicalPath) {
        issues.push({
          severity: "error",
          code: "not_git_root",
          message: `Path is no longer the git root (expected ${root})`,
          repositoryId: repo.id,
        })
      }
    }

    if (repo.access === "read-only" && repo.kind === "git") {
      issues.push({
        severity: "warning",
        code: "read_only_git",
        message: `Repository "${repo.id}" is read-only; writes will be denied`,
        repositoryId: repo.id,
      })
    }
  }

  if (info.defaults.allowUnregisteredWrites) {
    issues.push({
      severity: "warning",
      code: "allow_unregistered_writes",
      message: "allow_unregistered_writes is true; prefer registering repositories explicitly",
    })
  }

  if (info.layout === "superproject") {
    issues.push({
      severity: "warning",
      code: "superproject_layout",
      message:
        "Superproject workspace: implement and commit inside submodules. Superproject pointer updates are a separate change set. Never auto-run submodule update/checkout without approval.",
    })
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    repositoryCount: info.repositories.size,
    primaryRepositoryId: info.primaryRepositoryId,
    name: info.name,
    layout: info.layout,
  }
}
