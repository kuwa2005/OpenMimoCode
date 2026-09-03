import type { TuiPlugin, TuiPluginModule } from "@mimo-ai/plugin/tui"
import { createResource, createMemo, Show } from "solid-js"
import { loadDashboard } from "@/evolve/store"
import { useProject } from "@tui/context/project"
import { useTheme } from "@tui/context/theme"

const id = "internal:sidebar-evolve"

function View() {
  const project = useProject()
  const { theme } = useTheme()
  const [dash] = createResource(
    () => {
      const projectID = project.project()
      const worktree = project.instance.path().worktree || project.instance.path().directory
      if (!projectID || !worktree) return undefined
      return { projectID, worktree }
    },
    (key) => (key ? loadDashboard(key) : undefined),
  )
  const show = createMemo(() => {
    const d = dash()
    if (!d) return false
    return d.skillsCount + d.backlogOpen + d.briefsOpen.length + d.frictionReports.length > 0
  })

  return (
    <Show when={show()}>
      <box>
        <box flexDirection="row" gap={1}>
          <text fg={theme.text}>
            <b>Evolve</b>
          </text>
        </box>
        <box flexDirection="row" gap={1}>
          <text flexShrink={0} fg={theme.primary}>
            •
          </text>
          <text fg={theme.textMuted}>
            skills {dash()!.skillsCount} · backlog {dash()!.backlogOpen} · briefs {dash()!.briefsOpen.length}
          </text>
        </box>
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 360,
    slots: {
      sidebar_content() {
        return <View />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
