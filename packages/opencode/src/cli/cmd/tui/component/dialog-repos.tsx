import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useProject } from "@tui/context/project"
import { For, Show, createResource, createMemo } from "solid-js"
import * as RepoWorkspace from "@/repo-workspace"

export function DialogRepos() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const project = useProject()
  const root = () => project.instance.path().directory || project.instance.path().worktree

  const [bundle] = createResource(root, async (dir) => {
    if (!dir) return undefined
    const info = await RepoWorkspace.Runtime.load(dir)
    if (!info) return { info: undefined as RepoWorkspace.Info | undefined, report: undefined, edges: 0 }
    const graph = await RepoWorkspace.Graph.buildGraph(info).catch(() => undefined)
    return { info, report: RepoWorkspace.doctor(info), edges: graph?.edges.length ?? 0 }
  })

  const rows = createMemo(() => {
    const b = bundle()
    if (!b?.info) return [] as Array<{ k: string; v: string }>
    const info = b.info
    const lines: Array<{ k: string; v: string }> = [
      { k: "Name", v: info.name },
      { k: "Primary", v: info.primaryRepositoryId },
      { k: "Layout", v: info.layout ?? "siblings" },
      { k: "Config", v: info.configPath },
      { k: "Doctor", v: b.report?.ok ? "OK" : "ISSUES" },
      { k: "Graph", v: `${b.edges} edges (oimo repos graph)` },
    ]
    for (const repo of info.repositories.values()) {
      lines.push({
        k: repo.id,
        v: `${repo.kind}/${repo.access} ${repo.canonicalPath}`,
      })
    }
    for (const issue of b.report?.issues ?? []) {
      lines.push({
        k: issue.severity,
        v: `${issue.code}${issue.repositoryId ? ` (${issue.repositoryId})` : ""}: ${issue.message}`,
      })
    }
    return lines
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1} maxHeight={28}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Multi-repo workspace
        </text>
        <text fg={theme.textMuted} onMouseDown={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show
        when={bundle()?.info}
        fallback={<text fg={theme.textMuted}>No repos.txt / workspace.yaml / .gitmodules in this directory.</text>}
      >
        <For each={rows()}>
          {(row) => (
            <box flexDirection="row" gap={2}>
              <text fg={theme.textMuted} width={12}>
                {row.k}
              </text>
              <text fg={theme.text}>{row.v}</text>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}
