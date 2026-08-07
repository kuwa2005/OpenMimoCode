#!/usr/bin/env bun

import path from "node:path"
import { $ } from "bun"
import { bumpVersions } from "./bump-version.ts"

const root = path.resolve(import.meta.dir, "..")

export function nextVersion(current: string, type: string): string {
  const [major, minor, patch] = current.split(".").map(Number)
  if (type === "major") return `${major + 1}.0.0`
  if (type === "minor") return `${major}.${minor + 1}.0`
  if (type === "patch") return `${major}.${minor}.${patch + 1}`
  return current
}

if (import.meta.main) {
  const arg = process.argv[2]
  if (!arg) {
    console.error("Usage: bun script/bump.ts <major|minor|patch|X.Y.Z>")
    process.exit(1)
  }
  const version = /^\d+\.\d+\.\d+$/.test(arg)
    ? arg
    : nextVersion(
        (await Bun.file(path.join(root, "packages/opencode/package.json")).json()).version,
        arg,
      )
  const changed = await bumpVersions(version, root)
  if (changed.length > 0) {
    await $`git add ${changed}`.cwd(root)
    await $`git commit -m "chore: bump version to ${version}"`.cwd(root)
  }
  console.log(version)
}
