#!/usr/bin/env bun

import path from "node:path"

const root = path.resolve(import.meta.dir, "..")

export async function bumpVersions(
  version: string,
  root: string = path.resolve(import.meta.dir, ".."),
): Promise<string[]> {
  const files: string[] = []
  for await (const match of new Bun.Glob("**/package.json").scan({ cwd: root })) {
    if (match.includes("node_modules") || match.includes("/dist/") || match.startsWith("dist/")) continue
    files.push(match)
  }
  const changed: string[] = []
  for (const rel of files) {
    const abs = path.join(root, rel)
    const original = await Bun.file(abs).text()
    const next = original.replaceAll(/"version":\s*"[^"]+"/g, `"version": "${version}"`)
    if (next !== original) {
      await Bun.file(abs).write(next)
      changed.push(abs)
    }
  }
  return changed
}

if (import.meta.main) {
  const version = process.argv[2]
  if (!version) {
    console.error("Usage: bun script/bump-version.ts <version>")
    process.exit(1)
  }
  for (const file of await bumpVersions(version)) console.log("updated:", file)
}
