# Multi-repository usage (oimo)

oimo can treat several Git repositories as one **system workspace**.
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

4. Launch oimo from the primary app repo (or the workspace root once CLI wiring is active):

```bash
cd backend && oimo
```

Discovery order under a directory:

1. `.oimo/workspace.yaml` (or `.json` / `.jsonc`)
2. `.oimo/repos.txt` (or `repos.list` / `repositories.txt`)
3. `.gitmodules` → **superproject** mode

### `repos.txt` syntax

```text
name: customer-platform
primary: backend

https://github.com/org/frontend
https://github.com/org/backend
https://github.com/org/shared-schema
https://github.com/org/infra read-only
https://github.com/org/api-server id=backend
../already-cloned-billing
```

- Blank lines and `#` comments are ignored.
- Default id = last path segment of the URL.
- `read-only` blocks writes (Phase 1 Resolver already enforces this).
- Missing clones are reported by doctor with `git clone` hints (no auto-clone without approval).

Sample: `docs/multi-repo/samples/url-list/`

## Sibling YAML (full control)

When you need roles and explicit relative paths, use `.oimo/workspace.yaml`:

Sample: `docs/multi-repo/samples/siblings-yaml/workspace.yaml`

## Git submodule superproject

If the directory has `.gitmodules` and no workspace/repos file, oimo registers:

| Kind | Role |
|------|------|
| `superproject` | Workspace management only (default read-only). Not preferred for app implementation. |
| `submodule` | Real application repositories. Commits/PRs happen here. |

oimo inspects each submodule locally (no network):

- recorded commit (gitlink in superproject)
- checked-out commit / branch
- tracking branch from `.gitmodules`
- remotes, initialized?, dirty?
- commit mismatch / behind tracking branch → **warnings** for impact analysis

**Safety**

- Nested sibling repos are still rejected; submodule nesting under a superproject is allowed.
- Never auto `submodule update` / fetch / checkout — explain network + worktree impact and ask approval.
- Superproject pointer updates are a **separate** change set from submodule code changes.

Sample `.gitmodules`: `docs/multi-repo/samples/superproject/gitmodules.sample`

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

- Architecture survey: `docs/multi-repo/current-architecture.md`
- Implementation plan: `docs/multi-repo/implementation-plan.md`
- Instruction source: `docs/oimo-multi-repository-implementation-instructions.md`
- Original features (FDE + multi-repo): `オリジナル実装.md`
