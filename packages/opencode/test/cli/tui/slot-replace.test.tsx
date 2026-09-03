/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { createSolidSlotRegistry, testRender, useRenderer } from "@opentui/solid"
import { createResource, createSignal, onMount, Show } from "solid-js"
import { createHostSlot } from "../../../src/cli/cmd/tui/plugin/slots"

type Slots = {
  prompt: {}
}

test("replace slot mounts plugin content once", async () => {
  let mounts = 0

  const Probe = () => {
    onMount(() => {
      mounts += 1
    })

    return <box />
  }

  const App = () => {
    const renderer = useRenderer()
    const reg = createSolidSlotRegistry<Slots>(renderer, {})
    const Slot = createHostSlot(reg)

    reg.register({
      id: "plugin",
      slots: {
        prompt() {
          return <Probe />
        },
      },
    })

    return (
      <box>
        <Slot name="prompt" mode="replace">
          <box />
        </Slot>
      </box>
    )
  }

  await testRender(() => <App />)

  expect(mounts).toBe(1)
})

test("host slot does not remount when the plugin view updates", async () => {
  let mounts = 0
  let bump: (() => void) | undefined

  const Probe = () => {
    const [count, setCount] = createSignal(0)
    bump = () => setCount((n) => n + 1)
    onMount(() => {
      mounts += 1
    })
    return <text>{String(count())}</text>
  }

  const App = () => {
    const renderer = useRenderer()
    const reg = createSolidSlotRegistry<Slots>(renderer, {})
    const Slot = createHostSlot(reg)
    reg.register({
      id: "plugin",
      slots: {
        prompt() {
          return <Probe />
        },
      },
    })
    return (
      <box>
        <Slot name="prompt" mode="replace" />
      </box>
    )
  }

  const handle = await testRender(() => <App />)
  expect(mounts).toBe(1)
  bump?.()
  await handle.renderOnce()
  expect(mounts).toBe(1)
})

async function runAsyncShowSlot(SlotFactory: typeof createHostSlot) {
  let mounts = 0
  let fetches = 0

  const Probe = () => {
    onMount(() => {
      mounts += 1
    })
    const [data] = createResource(async () => {
      fetches += 1
      await Promise.resolve()
      return "ready"
    })
    return (
      <Show when={data()}>
        <text>{data()}</text>
      </Show>
    )
  }

  const App = () => {
    const renderer = useRenderer()
    const reg = createSolidSlotRegistry<Slots>(renderer, {})
    const Slot = SlotFactory(reg)
    reg.register({
      id: "plugin",
      slots: {
        prompt() {
          return <Probe />
        },
      },
    })
    return (
      <box>
        <Slot name="prompt" mode="replace" />
      </box>
    )
  }

  const handle = await testRender(() => <App />)
  await handle.flush()
  await handle.waitForVisualIdle({ maxFrames: 30 })
  return { mounts, fetches }
}

test("host slot fallback children stay mounted when they update", async () => {
  let mounts = 0
  let bump: (() => void) | undefined

  const Fallback = () => {
    const [count, setCount] = createSignal(0)
    bump = () => setCount((n) => n + 1)
    onMount(() => {
      mounts += 1
    })
    return <text>{String(count())}</text>
  }

  const App = () => {
    const renderer = useRenderer()
    const reg = createSolidSlotRegistry<Slots>(renderer, {})
    const Slot = createHostSlot(reg)
    return (
      <box>
        <Slot name="prompt" mode="replace">
          <Fallback />
        </Slot>
      </box>
    )
  }

  const handle = await testRender(() => <App />)
  expect(mounts).toBe(1)
  bump?.()
  await handle.renderOnce()
  expect(mounts).toBe(1)
})

test("host slot fetches once when plugin content appears asynchronously", async () => {
  const result = await runAsyncShowSlot(createHostSlot)
  expect(result.mounts).toBe(1)
  expect(result.fetches).toBe(1)
})
