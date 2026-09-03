# Multi-repository usage (oimo)

oimo can treat several Git repositories as one **system workspace**.

**キー・パラメータの詳細（日本語）:** [config-reference.ja.md](./config-reference.ja.md)

Start with the simplest format: a text file of GitHub URLs.

## Quick start (recommended): `repos.txt`

1. Create a folder for the system (does not need to be a git repo):

```text
mkdir -p ~/work/customer-platform/.oimo
cd ~/work/customer-platform
```

2. Copy the sample and edit URLs:

```bash
cp /path/to/OpenMimoCode/docs/multi-repo/samples/url-list/repos.txt .oimo/repos.txt
# edit .oimo/repos.txt — one https://github.com/... line per repo
```

3. Clone siblings (folder name = last segment of the URL, or `id=`):

```bash
# manual
git clone https://github.com/example-org/frontend
git clone https://github.com/example-org/backend
# or use the helper (reads .oimo/repos.txt)
bash /path/to/OpenMimoCode/docs/multi-repo/samples/url-list/clone-from-repos-txt.sh
```

4. Launch oimo from the primary app repo:

```bash
cd backend && oimo
```

Discovery order under a directory:

1. `.oimo/workspace.yaml` (or `.json` / `.jsonc`)
2. `.oimo/repos.txt` (or `repos.list` / `repositories.txt`)
3. `.gitmodules` → **superproject** mode

### `repos.txt` — keys at a glance

| Line / token | Meaning |
|--------------|---------|
| `name: <label>` | Workspace display name (optional; default `workspace`) |
| `primary: <id>` | Default repository id (optional; default = first repo line) |
| `https://…` / `git@…` | Remote URL → expect clone at `<workspace>/<id>/` |
| local path | Already-cloned path (relative to workspace root) |
| `read-only` | Deny writes |
| `id=<id>` | Override registry id (default = last path segment) |
| `role=<text>` | Short human role note |

Full tables: [config-reference.ja.md §1](./config-reference.ja.md)

Sample: `docs/multi-repo/samples/url-list/`

## Sibling YAML (full control)

When you need roles and explicit relative paths, use `.oimo/workspace.yaml`.

| Key | Meaning |
|-----|---------|
| `version` | Must be `1` |
| `name` | Workspace display name |
| `primary` | Must match a `repositories[].id` |
| `repositories[].id` | Stable id (`repo-id:path` in UI) |
| `repositories[].path` | Abs/rel path; for `kind: git` must be worktree root |
| `repositories[].role` | Human role |
| `repositories[].access` | `read-only` \| `read-write` |
| `repositories[].kind` | `git` (default) \| `directory` \| `superproject` \| `submodule` |
| `defaults.*` | Unregistered read/write + require cross-repo plan |

Full tables: [config-reference.ja.md §2](./config-reference.ja.md)  
Sample: `docs/multi-repo/samples/siblings-yaml/workspace.yaml`

## Git submodule superproject

If the directory has `.gitmodules` and no workspace/repos file, oimo registers:

| Kind | Role |
|------|------|
| `superproject` | Workspace management only (default read-only). Not preferred for app implementation. |
| `submodule` | Real application repositories. Commits/PRs happen here. |

`.gitmodules` keys oimo reads: section `name`, `path`, `url`, `branch` — see [config-reference.ja.md §3](./config-reference.ja.md).

oimo inspects each submodule locally (no network): recorded vs checked-out commit, tracking branch, remotes, initialized?, dirty?, mismatch/behind → warnings.

**Safety**

- Nested sibling repos are still rejected; submodule nesting under a superproject is allowed.
- Never auto `submodule update` / fetch / checkout — explain network + worktree impact and ask approval.
- Superproject pointer updates are a **separate** change set from submodule code changes.

Sample: `docs/multi-repo/samples/superproject/gitmodules.sample`

## What works in this release (Phase 1 foundation)

| Capability | Status |
|------------|--------|
| Register repos via `repos.txt` / `workspace.yaml` / `.gitmodules` | Yes |
| Path resolve, `repo-id:path`, read-only / unregistered deny | Yes (Resolver) |
| Doctor + session fingerprint (incl. submodule snapshot fields) | Yes |
| Cross-repo search / impact graph / multi-repo edit pipeline | Planned (Phase 2–5) |
| TUI `/repos` commands | Planned |

Single-repo use without any of these files is unchanged.

## Safety rules (always)

1. Unregistered paths: no writes.
2. `read-only` repos: no writes.
3. Do not stash/reset dirty trees.
4. Do not treat detected dependencies as facts without evidence (Phase 3).
5. Secrets (`.env`, keys) must not be dumped into LLM context from cross-search.

## Related docs

- **設定キー詳細（日本語）:** [config-reference.ja.md](./config-reference.ja.md)
- Architecture survey: `docs/multi-repo/current-architecture.md`
- Implementation plan: `docs/multi-repo/implementation-plan.md`
- Instruction source: `docs/oimo-multi-repository-implementation-instructions.md`
- Original features (FDE + multi-repo): `オリジナル実装.md`
