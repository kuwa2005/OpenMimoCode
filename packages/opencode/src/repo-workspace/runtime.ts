import { Instance } from "@/project/instance"
import type { Info } from "./schema"
import { loadFromPrimary } from "./load"
import { doctor as runDoctor } from "./doctor"
import * as SessionFingerprint from "./session-fingerprint"

const cache = new Map<string, Promise<Info | undefined>>()

/** Load (and cache) RepoWorkspace for a directory. Missing config → undefined. */
export function load(directory: string): Promise<Info | undefined> {
  const key = directory
  const hit = cache.get(key)
  if (hit) return hit
  const task = loadFromPrimary(directory).catch((error) => {
    if (cache.get(key) === task) cache.delete(key)
    throw error
  })
  cache.set(key, task)
  return task
}

export function invalidate(directory?: string) {
  if (directory) {
    cache.delete(directory)
    return
  }
  cache.clear()
}

/** Current Instance directory's workspace, if any. */
export async function current(): Promise<Info | undefined> {
  try {
    return await load(Instance.directory)
  } catch {
    return
  }
}

export async function doctorCurrent() {
  const info = await current()
  if (!info) return
  return { info, report: runDoctor(info) }
}

/** Persist fingerprint for a session when a workspace is active. */
export async function captureSession(sessionID: string, directory?: string) {
  const info = await load(directory ?? Instance.directory)
  if (!info) return
  return SessionFingerprint.save(sessionID, info)
}

export async function restoreSession(sessionID: string) {
  const fp = await SessionFingerprint.load(sessionID)
  if (!fp) return
  return SessionFingerprint.reconcile(fp)
}
