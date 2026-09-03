# Multi-repository fixtures

Skeleton for Phase 1+ multi-repo tests. Directories are **not** pre-initialized as git
repos (nested `.git` must not enter the monorepo). Tests call `git init` in a temp copy.

Layout:

- `backend/` — primary (contains `.oimo/workspace.yaml`)
- `frontend/`, `shared-schema/`, `infra/` — sibling git targets after `git init`
- `notes/` — non-git `kind: directory`
- `outside-workspace/` — must remain unregistered
