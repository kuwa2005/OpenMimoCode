#!/usr/bin/env bun

import { Script } from "@mimo-ai/script"
import { $ } from "bun"
import { fileURLToPath } from "url"

console.log("=== publishing ===\n")

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const { bumpVersions } = await import("./bump-version.ts")
const changed = await bumpVersions(Script.version)
for (const file of changed) console.log("updated:", file)

await $`bun install`
await $`./packages/sdk/js/script/build.ts`

console.log("\n=== cli ===\n")
await $`bun ./packages/opencode/script/publish.ts`

console.log("\n=== sdk ===\n")
await $`bun ./packages/sdk/js/script/publish.ts`

console.log("\n=== plugin ===\n")
await $`bun ./packages/plugin/script/publish.ts`
