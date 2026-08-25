import path from "path"
import fs from "fs/promises"
import { evolveRoot } from "./store"

const SNAPSHOT_TARGETS = ["skills", "tools", "hooks", "workflows", "tui"] as const

export type SnapshotInfo = {
  id: string
  path: string
  createdAt: string
  targets: string[]
}

async function copyTree(from: string, to: string) {
  try {
    await fs.access(from)
  } catch {
    return false
  }
  await fs.mkdir(to, { recursive: true })
  const entries = await fs.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) {
      await copyTree(src, dst)
      continue
    }
    if (entry.isFile()) await fs.copyFile(src, dst)
  }
  return true
}

export async function createSnapshot(
  input: { projectID: string; worktree: string },
  label?: string,
): Promise<SnapshotInfo> {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}${label ? `-${label}` : ""}`
  const snapRoot = path.join(evolveRoot(input.projectID), "snapshots", id)
  await fs.mkdir(snapRoot, { recursive: true })
  const oimo = path.join(input.worktree, ".oimo")
  const targets: string[] = []
  for (const name of SNAPSHOT_TARGETS) {
    if (await copyTree(path.join(oimo, name), path.join(snapRoot, name))) targets.push(name)
  }
  const meta = {
    id,
    createdAt: new Date().toISOString(),
    targets,
  }
  await Bun.write(path.join(snapRoot, "meta.json"), JSON.stringify(meta, null, 2))
  return { id, path: snapRoot, createdAt: meta.createdAt, targets }
}

export async function listSnapshots(projectID: string): Promise<SnapshotInfo[]> {
  const dir = path.join(evolveRoot(projectID), "snapshots")
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const out: SnapshotInfo[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const metaPath = path.join(dir, entry.name, "meta.json")
      if (!(await Bun.file(metaPath).exists())) continue
      const raw = (await Bun.file(metaPath).json()) as {
        id: string
        createdAt: string
        targets: string[]
      }
      out.push({ id: raw.id, path: path.join(dir, entry.name), createdAt: raw.createdAt, targets: raw.targets })
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

export async function rollbackSnapshot(
  input: { projectID: string; worktree: string },
  snapshotID: string,
): Promise<SnapshotInfo> {
  const snapRoot = path.join(evolveRoot(input.projectID), "snapshots", snapshotID)
  const metaPath = path.join(snapRoot, "meta.json")
  if (!(await Bun.file(metaPath).exists())) throw new Error(`Snapshot not found: ${snapshotID}`)
  const meta = (await Bun.file(metaPath).json()) as {
    id: string
    createdAt: string
    targets: string[]
  }
  await createSnapshot(input, "pre-rollback")
  const oimo = path.join(input.worktree, ".oimo")
  for (const name of meta.targets) {
    const dst = path.join(oimo, name)
    await fs.rm(dst, { recursive: true, force: true })
    await copyTree(path.join(snapRoot, name), dst)
  }
  return { id: meta.id, path: snapRoot, createdAt: meta.createdAt, targets: meta.targets }
}
