import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@mimo-ai/plugin/tui"
import { createResource, createMemo, Show } from "solid-js"
import { loadDashboard } from "@/evolve/store"

const id = "internal:sidebar-evolve"

function View(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const worktree = () => props.api.state.path.worktree || props.api.state.path.directory
  const [projectID] = createResource(
    () => props.api.state.path.directory,
    async () => {
      const res = await props.api.client.project.current()
      return res.data?.id as string | undefined
    },
  )
  const [dash] = createResource(
    () => {
      const pid = projectID()
      const wt = worktree()
      if (!pid || !wt) return undefined
      return { projectID: pid, worktree: wt }
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
          <text fg={theme().text}>
            <b>Evolve</b>
          </text>
        </box>
        <box flexDirection="row" gap={1}>
          <text flexShrink={0} fg={theme().primary}>
            •
          </text>
          <text fg={theme().textMuted}>
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
      sidebar_content(_ctx, _props) {
        return <View api={api} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
