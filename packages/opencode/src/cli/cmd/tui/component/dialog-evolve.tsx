import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useProject } from "@tui/context/project"
import { For, Show, createResource, createMemo } from "solid-js"
import { loadDashboard } from "@/evolve/store"
import { listSnapshots } from "@/evolve/rollback"

export function DialogEvolve() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const project = useProject()
  const worktree = () => project.instance.path().worktree || project.instance.path().directory

  const [dash] = createResource(worktree, (wt) => (wt ? loadDashboard(wt) : undefined))
  const [snaps] = createResource(worktree, (wt) => (wt ? listSnapshots(wt) : []))

  const rows = createMemo(() => {
    const d = dash()
    if (!d) return [] as Array<{ k: string; v: string }>
    return [
      { k: "Skills", v: String(d.skillsCount) },
      { k: "Backlog open", v: String(d.backlogOpen) },
      { k: "Briefs", v: String(d.briefsOpen.length) },
      { k: "Friction reports", v: String(d.frictionReports.length) },
      { k: "Reviews", v: String(d.reviews.length) },
      { k: "Snapshots", v: String(snaps()?.length ?? 0) },
    ]
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1} maxHeight={24}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Self Evolution
        </text>
        <text fg={theme.textMuted} onMouseDown={() => dialog.clear()}>
          esc
        </text>
      </box>

      <Show when={dash.loading}>
        <text fg={theme.textMuted}>Loading .oimo/evolve…</text>
      </Show>

      <Show when={dash.error}>
        <text fg={theme.error}>Failed to load evolve dashboard</text>
      </Show>

      <For each={rows()}>
        {(row) => (
          <box flexDirection="row" gap={2}>
            <text fg={theme.textMuted} width={18}>
              {row.k}
            </text>
            <text fg={theme.text}>{row.v}</text>
          </box>
        )}
      </For>

      <Show when={(dash()?.briefsOpen.length ?? 0) > 0}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Open briefs
        </text>
        <For each={dash()!.briefsOpen.slice(0, 8)}>
          {(name) => <text fg={theme.textMuted}>• {name}</text>}
        </For>
      </Show>

      <Show when={dash()?.historyHead}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          History
        </text>
        <text fg={theme.textMuted} wrapMode="word">
          {dash()!.historyHead}
        </text>
      </Show>

      <text fg={theme.textMuted} wrapMode="word">
        Run /evolve or /self-improve to refresh. Hand briefs to an external agent to patch oimo.
      </text>
    </box>
  )
}
