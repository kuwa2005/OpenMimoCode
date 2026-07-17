import { Effect, Layer } from "effect"
import { Bus } from "../../src/bus"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Permission } from "../../src/permission"
import { Config } from "../../src/config"

export const mockConfig = Layer.mock(Config.Service)({
  get: () => Effect.succeed({}),
})

export function permissionEnv(bus = Bus.layer) {
  return Layer.mergeAll(
    Permission.layer.pipe(Layer.provide(Layer.mergeAll(bus, mockConfig))),
    bus,
    CrossSpawnSpawner.defaultLayer,
  )
}

export function permissionEnvWithAutonomy(bus = Bus.layer) {
  const autonomyConfig = Layer.mock(Config.Service)({
    get: () => Effect.succeed({ autonomy: { enabled: true } }),
  })
  return Layer.mergeAll(
    Permission.layer.pipe(Layer.provide(Layer.mergeAll(bus, autonomyConfig))),
    bus,
    CrossSpawnSpawner.defaultLayer,
  )
}
