/**
 * Auto Model (free) ranking from local response / quality stats.
 *
 * - Rank by excellence (good vs bad), with catalog order as Bayesian prior
 *   so cold-start still prefers big-pickle etc.
 * - Rate-limit only applies a short cooldown (not a sticky "winner").
 *   After cooldown, high-scoring models return to the front.
 * - Persisted under Global.Path.data so rankings survive restarts.
 */

import fs from "fs"
import path from "path"
import { Global } from "@/global"

export const AUTO_FREE_COOLDOWN_MS = 3 * 60 * 1000

export type AutoFreeRefStats = {
  /** Pre-commit stream finished without error */
  served: number
  /** Usable step: tools and/or real text (not think-only / empty) */
  good: number
  /** Quality failure: think-only, invalid, schema/tool junk, empty */
  bad: number
  /** Transient capacity (rate limit / 5xx) before commit */
  limited: number
  cooledUntil?: number
  updatedAt: number
}

type Store = {
  version: 1
  refs: Record<string, AutoFreeRefStats>
}

const EMPTY: Store = { version: 1, refs: {} }

let memory: Store = { version: 1, refs: {} }
let loaded = false
let writeTimer: ReturnType<typeof setTimeout> | undefined
let persistPath: string | undefined
let persistEnabled = true

export function autoFreeRef(model: { providerID: string; id: string }) {
  return `${model.providerID}/${model.id}`
}

function statsFile() {
  return persistPath ?? path.join(Global.Path.data, "auto-free-stats.json")
}

function ensureLoaded() {
  if (loaded) return
  loaded = true
  if (!persistEnabled) return
  try {
    const raw = fs.readFileSync(statsFile(), "utf8")
    const data = JSON.parse(raw) as Store
    if (data?.version === 1 && data.refs && typeof data.refs === "object") {
      memory = { version: 1, refs: { ...data.refs } }
    }
  } catch {
    // missing or corrupt → start empty
  }
}

function schedulePersist() {
  if (!persistEnabled) return
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = undefined
    try {
      fs.mkdirSync(path.dirname(statsFile()), { recursive: true })
      fs.writeFileSync(statsFile(), JSON.stringify(memory, null, 2))
    } catch {
      // ignore disk errors; in-memory ranking still works
    }
  }, 500)
}

function touch(ref: string, now: number): AutoFreeRefStats {
  ensureLoaded()
  const cur = memory.refs[ref]
  if (cur) {
    cur.updatedAt = now
    return cur
  }
  const created: AutoFreeRefStats = {
    served: 0,
    good: 0,
    bad: 0,
    limited: 0,
    updatedAt: now,
  }
  memory.refs[ref] = created
  return created
}

/** Catalog index → prior mass so early entries (big-pickle) win when unknown. */
export function catalogPrior(catalogIndex: number) {
  // Strong prior: index 0 ≈ big-pickle stays preferred until real evidence accumulates.
  const priorGood = Math.max(2, 40 - catalogIndex * 2)
  const priorBad = 3
  return { priorGood, priorBad }
}

/**
 * Excellence in [0,1]; higher is better.
 * Few samples → lean on catalog order so a temporary failover winner does not
 * permanently outrank big-pickle after its rate-limit cooldown ends.
 */
export function excellenceScore(stats: AutoFreeRefStats | undefined, catalogIndex: number) {
  const { priorGood, priorBad } = catalogPrior(catalogIndex)
  const good = stats?.good ?? 0
  const bad = stats?.bad ?? 0
  const samples = good + bad
  const bayes = (good + priorGood) / (samples + priorGood + priorBad)
  const catalogScore = 1 / (1 + catalogIndex)
  if (samples < 8) return 0.7 * catalogScore + 0.3 * bayes
  return 0.25 * catalogScore + 0.75 * bayes
}

export function responseRate(stats: AutoFreeRefStats | undefined) {
  const served = stats?.served ?? 0
  const limited = stats?.limited ?? 0
  const total = served + limited
  if (total === 0) return undefined
  return served / total
}

export function rememberAutoFreeSuccess(ref: string, now = Date.now()) {
  const s = touch(ref, now)
  s.served++
  if (s.cooledUntil && s.cooledUntil <= now) delete s.cooledUntil
  schedulePersist()
}

export function rememberAutoFreeFailure(ref: string, now = Date.now()) {
  const s = touch(ref, now)
  s.limited++
  s.cooledUntil = now + AUTO_FREE_COOLDOWN_MS
  schedulePersist()
}

export function rememberAutoFreeGood(ref: string, now = Date.now()) {
  const s = touch(ref, now)
  s.good++
  schedulePersist()
}

export function rememberAutoFreeBad(ref: string, now = Date.now()) {
  const s = touch(ref, now)
  s.bad++
  schedulePersist()
}

/**
 * Order free candidates: not-cooled first, then excellence desc, catalog index asc.
 * Cooldown is short; sticky last-winner is intentionally absent.
 */
export function reorderAutoFreeCandidates<T extends { providerID: string; id: string }>(
  candidates: T[],
  now = Date.now(),
): T[] {
  ensureLoaded()

  const ranked = candidates.map((candidate, catalogIndex) => {
    const ref = autoFreeRef(candidate)
    const stats = memory.refs[ref]
    const cold = (stats?.cooledUntil ?? 0) > now
    const score = excellenceScore(stats, catalogIndex)
    return { candidate, catalogIndex, cold, score }
  })

  ranked.sort((a, b) => {
    if (a.cold !== b.cold) return a.cold ? 1 : -1
    if (a.score !== b.score) return b.score - a.score
    return a.catalogIndex - b.catalogIndex
  })

  return ranked.map((r) => r.candidate)
}

export function snapshotAutoFreeStats(): Store {
  ensureLoaded()
  return structuredClone(memory)
}

/** Test reset. Disables disk by default. */
export function resetAutoFreeSticky(opts?: { persist?: boolean; path?: string }) {
  memory = structuredClone(EMPTY)
  loaded = true
  persistEnabled = opts?.persist === true
  persistPath = opts?.path
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = undefined
  }
}

export const resetAutoFreeStats = resetAutoFreeSticky
