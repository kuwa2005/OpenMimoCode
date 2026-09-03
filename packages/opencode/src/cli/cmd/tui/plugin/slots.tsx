import type { TuiPluginApi, TuiSlotContext, TuiSlotMap, TuiSlotProps } from "@mimo-ai/plugin/tui"
import { createSolidSlotRegistry, type JSX, type SolidPlugin } from "@opentui/solid"
import { ErrorBoundary, For, Match, Show, Switch, createMemo, createSignal, onCleanup, splitProps, untrack } from "solid-js"
import { isRecord } from "@/util/record"

type RuntimeSlotMap = TuiSlotMap<Record<string, object>>

type HostEntry = {
  id: string
  renderer: (ctx: never, props: never) => JSX.Element
}

type HostRegistry = {
  context: object
  subscribe(listener: () => void): () => void
  resolveEntries(slot: string): HostEntry[]
  reportPluginError(report: {
    pluginId: string
    slot?: string
    phase: "render"
    source: "solid"
    error: unknown
  }): unknown
}

type Slot = <Name extends string>(props: TuiSlotProps<Name>) => JSX.Element | null
export type HostSlotPlugin<Slots extends Record<string, object> = {}> = SolidPlugin<TuiSlotMap<Slots>, TuiSlotContext>

export type HostPluginApi = TuiPluginApi
export type HostSlots = {
  register: {
    (plugin: HostSlotPlugin): () => void
    <Slots extends Record<string, object>>(plugin: HostSlotPlugin<Slots>): () => void
  }
}

function empty<Name extends string>(_props: TuiSlotProps<Name>) {
  return null
}

let view: Slot = empty

export const Slot: Slot = (props) => view(props)

function isHostSlotPlugin(value: unknown): value is HostSlotPlugin<Record<string, object>> {
  if (!isRecord(value)) return false
  if (typeof value.id !== "string") return false
  if (!isRecord(value.slots)) return false
  return true
}

function trackHostSlotProps(slotProps: object) {
  const rec = slotProps as Record<string, unknown>
  rec.session_id
  rec.workspace_id
  rec.visible
  rec.disabled
  rec.title
  rec.share_url
}

function stabilizeEntries(previous: HostEntry[], resolved: HostEntry[]) {
  if (resolved.length === 0) {
    if (previous.length === 0) return previous
    return []
  }
  const previousById = new Map(previous.map((entry) => [entry.id, entry]))
  const next = resolved.map((entry) => {
    const prev = previousById.get(entry.id)
    if (prev && prev.renderer === entry.renderer) return prev
    return entry
  })
  const unchanged = next.length === previous.length && next.every((entry, index) => entry === previous[index])
  if (unchanged) return previous
  return next
}

function bindRegistry(registry: {
  context: object
  subscribe(listener: () => void): () => void
  resolveEntries: (slot: never) => HostEntry[]
  reportPluginError: (report: {
    pluginId: string
    slot?: string
    phase: "render" | "setup" | "dispose" | "error_placeholder"
    source?: string
    error: unknown
  }) => unknown
}): HostRegistry {
  return {
    get context() {
      return registry.context
    },
    subscribe(listener) {
      return registry.subscribe(listener)
    },
    resolveEntries(slot) {
      return registry.resolveEntries(slot as never)
    },
    reportPluginError(report) {
      return registry.reportPluginError(report)
    },
  }
}

function StableMount(props: {
  registry: HostRegistry
  slot: string
  entry: HostEntry
  slotProps: object
  fallback?: JSX.Element
}) {
  const node = createMemo(() => {
    trackHostSlotProps(props.slotProps)
    const rendered = untrack(() => {
      try {
        return props.entry.renderer(props.registry.context as never, props.slotProps as never)
      } catch (error) {
        props.registry.reportPluginError({
          pluginId: props.entry.id,
          slot: props.slot,
          phase: "render",
          source: "solid",
          error,
        })
        return undefined
      }
    })
    if (rendered == null || rendered === false) return props.fallback ?? null
    return rendered
  })
  return (
    <ErrorBoundary
      fallback={(error) => {
        props.registry.reportPluginError({
          pluginId: props.entry.id,
          slot: props.slot,
          phase: "render",
          source: "solid",
          error,
        })
        return props.fallback ?? null
      }}
    >
      {node()}
    </ErrorBoundary>
  )
}

/**
 * OpenTUI's createSlot resolves plugin JSX with `children()` inside a memo.
 * When a plugin first renders empty (Show / createResource) and later has
 * output, that memo re-invokes the renderer and remounts the view — a
 * /project/current + TextBuffer storm that kills the input line.
 * Re-call the renderer only when host-owned slot props change.
 */
export function createHostSlot(registry: Parameters<typeof bindRegistry>[0]): Slot {
  const host = bindRegistry(registry)
  return function HostSlot(props) {
    const [local, slotProps] = splitProps(props, ["name", "mode", "children"])
    const [version, setVersion] = createSignal(0)
    let queued = false
    let disposed = false
    const unsubscribe = host.subscribe(() => {
      if (queued) return
      queued = true
      setVersion((current) => current + 1)
      queueMicrotask(() => {
        queued = false
        if (disposed) return
      })
    })
    onCleanup(() => {
      disposed = true
      unsubscribe()
    })

    const entries = createMemo((previous: HostEntry[] = []) => {
      version()
      return stabilizeEntries(previous, host.resolveEntries(String(local.name)))
    })
    const slotName = () => String(local.name)

    return (
      <Show when={entries().length > 0} fallback={local.children}>
        <Switch
          fallback={
            <>
              {local.children}
              <For each={entries()}>
                {(entry) => (
                  <StableMount registry={host} slot={slotName()} entry={entry} slotProps={slotProps} />
                )}
              </For>
            </>
          }
        >
          <Match when={local.mode === "single_winner" ? entries()[0] : undefined}>
            {(entry) => (
              <StableMount
                registry={host}
                slot={slotName()}
                entry={entry()}
                slotProps={slotProps}
                fallback={local.children}
              />
            )}
          </Match>
          <Match when={local.mode === "replace"}>
            <For each={entries()}>
              {(entry) => (
                <StableMount registry={host} slot={slotName()} entry={entry} slotProps={slotProps} />
              )}
            </For>
          </Match>
        </Switch>
      </Show>
    )
  }
}

export function setupSlots(api: HostPluginApi): HostSlots {
  const reg = createSolidSlotRegistry<RuntimeSlotMap, TuiSlotContext>(
    api.renderer,
    {
      theme: api.theme,
    },
    {
      onPluginError(event) {
        console.error("[tui.slot] plugin error", {
          plugin: event.pluginId,
          slot: event.slot,
          phase: event.phase,
          source: event.source,
          message: event.error.message,
        })
      },
    },
  )

  const slot = createHostSlot(reg)
  view = (props) => slot(props)
  return {
    register(plugin: HostSlotPlugin) {
      if (!isHostSlotPlugin(plugin)) return () => {}
      return reg.register(plugin)
    },
  }
}
