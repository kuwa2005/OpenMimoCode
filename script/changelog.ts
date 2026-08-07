#!/usr/bin/env bun

import { rm } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { $ } from "bun"

const root = path.resolve(import.meta.dir, "..")
const file = path.join(root, "UPCOMING_CHANGELOG.md")

const GROUPS: [string, RegExp][] = [
  ["Features", /^feat(\([^)]*\))?:/],
  ["Fixes", /^fix(\([^)]*\))?:/],
  ["Performance", /^perf(\([^)]*\))?:/],
  ["Refactor", /^refactor(\([^)]*\))?:/],
  ["Docs", /^docs(\([^)]*\))?:/],
  ["Chores", /^chore(\([^)]*\))?:/],
]

const cleanSubject = (line: string) => line.replace(/^[a-z]+(\([^)]*\))?:\s*/i, "")

export function renderChangelog(lines: string[]): string {
  const buckets = new Map<string, string[]>()
  for (const line of lines) {
    const group = GROUPS.find(([, re]) => re.test(line))?.[0] ?? "Other"
    const items = buckets.get(group)
    if (items) items.push(cleanSubject(line))
    else buckets.set(group, [cleanSubject(line)])
  }
  const sections = [...buckets.entries()].map(
    ([name, items]) => `### ${name}\n\n${items.map((item) => `- ${item}`).join("\n")}`,
  )
  const body = sections.join("\n\n")
  return `# Changelog\n\n${body.length > 0 ? body : "No notable changes"}\n`
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      from: { type: "string", short: "f" },
      to: { type: "string", short: "t" },
      print: { type: "boolean", short: "p" },
      help: { type: "boolean", short: "h" },
    },
  })

  if (values.help) {
    console.log("Usage: bun script/changelog.ts [--from <ref>] [--to <ref>] [--print]")
    process.exit(0)
  }

  await rm(file, { force: true })

  let from = values.from
  if (!from) {
    from = (await $`git describe --tags --abbrev=0`.text().catch(() => "").then((x) => x.trim())) || undefined
  }
  const to = values.to ?? "HEAD"
  const log = from
    ? await $`git log --format=%s --no-decorate ${from}..${to}`.text()
    : await $`git log --format=%s --no-decorate ${to}`.text()
  const lines = log.split("\n").filter(Boolean)

  await Bun.file(file).write(renderChangelog(lines))
  if (values.print) process.stdout.write(await Bun.file(file).text())
}
