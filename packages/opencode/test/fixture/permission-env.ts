import { Effect, Layer } from "effect"
import { Bus } from "../../src/bus"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Permission } from "../../src/permission"
import { Config } from "../../src/config"
import { emptyConsoleState } from "../../src/config/console-state"

function mockConfig(info: Config.Info) {
  return Layer.mock(Config.Service)({
    get: () => Effect.succeed(info),
    getGlobal: () => Effect.succeed(info),
    getConsoleState: () => Effect.succeed(emptyConsoleState),
    update: () => Effect.void,
    updateGlobal: () => Effect.succeed(info),
    invalidate: () => Effect.void,
    directories: () => Effect.succeed([]),
    waitForDependencies: () => Effect.void,
  })
}

const mockConfigEmpty = mockConfig({})
const mockConfigAutonomy = mockConfig({ autonomy: { enabled: true } })

export function permissionEnv(bus = Bus.layer) {
  return Layer.mergeAll(
    Permission.layer.pipe(Layer.provide(Layer.mergeAll(bus, mockConfigEmpty))),
    bus,
    CrossSpawnSpawner.defaultLayer,
  )
}

export function permissionEnvWithAutonomy(bus = Bus.layer) {
  return Layer.mergeAll(
    Permission.layer.pipe(Layer.provide(Layer.mergeAll(bus, mockConfigAutonomy))),
    bus,
    CrossSpawnSpawner.defaultLayer,
  )
}
