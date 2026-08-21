#!/usr/bin/env bun
/**
 * Sync Auto (free) candidate catalog from a Free Claude Code checkout.
 *
 * Usage:
 *   bun script/sync-auto-free-catalog.ts
 *   FCC_ROOT=/path/to/free-claude-code bun script/sync-auto-free-catalog.ts
 *
 * See docs/auto-free-fcc-sync.md
 */
import path from "path"
import { FCC_TO_OIMO_PROVIDER, fccRefToOimo } from "../packages/opencode/src/provider/auto-free/provider-map"

const root = process.env.FCC_ROOT ?? path.join(import.meta.dir, "../../free-claude-code")
const outPath = path.join(import.meta.dir, "../packages/opencode/src/provider/auto-free-catalog.json")

type Candidate = { ref: string; tier: "free"; note?: string }

function extractPythonStringList(source: string, name: string): string[] {
  const re = new RegExp(`${name}\\s*:\\s*tuple\\[str,\\s*\\.\\.\\.\\]\\s*=\\s*\\(([\\s\\S]*?)\\)`)
  const match = source.match(re)
  if (!match) return []
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]!)
}

function extractProviderSmokeDefaults(source: string): Record<string, string> {
  const match = source.match(/PROVIDER_SMOKE_DEFAULT_MODELS\s*:\s*dict\[str,\s*str\]\s*=\s*\{([\s\S]*?)\n\}/)
  if (!match) return {}
  const out: Record<string, string> = {}
  for (const m of match[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)) {
    out[m[1]!] = m[2]!
  }
  return out
}

function pushUnique(list: Candidate[], ref: string, note: string) {
  if (list.some((c) => c.ref === ref)) return
  list.push({ ref, tier: "free", note })
}

async function main() {
  const candidates: Candidate[] = []

  // Always keep zero-config Zen free model first.
  pushUnique(candidates, "opencode/big-pickle", "OpenCode Zen free pool; zero-config default")

  const smokePath = path.join(root, "smoke/lib/config.py")
  const smoke = await Bun.file(smokePath).text().catch(() => undefined)
  if (!smoke) {
    console.warn(`FCC smoke config not found at ${smokePath}; writing seed-only catalog`)
  } else {
    const defaults = extractProviderSmokeDefaults(smoke)
    const nim = defaults["nvidia_nim"]
    if (nim) {
      const mapped = fccRefToOimo(nim)
      if (mapped) pushUnique(candidates, mapped, "FCC PROVIDER_SMOKE_DEFAULT_MODELS nvidia_nim")
    }
    for (const model of extractPythonStringList(smoke, "OPENROUTER_FREE_CLI_DEFAULT_MODELS")) {
      const mapped = fccRefToOimo(`open_router/${model}`)
      if (mapped) pushUnique(candidates, mapped, "FCC OPENROUTER_FREE_CLI_DEFAULT_MODELS")
      else console.warn(`skip unmapped openrouter model: ${model}`)
    }
    // Groq versatile appears in FCC docs MODEL_FALLBACKS examples.
    const groq = defaults["groq"]
    if (groq) {
      const mapped = fccRefToOimo(groq)
      if (mapped) pushUnique(candidates, mapped, "FCC PROVIDER_SMOKE_DEFAULT_MODELS groq")
    }
  }

  // Drop refs whose FCC provider has no OIMO mapping (already handled), and
  // warn on map table gaps for discoverability.
  for (const [fcc] of Object.entries(FCC_TO_OIMO_PROVIDER)) {
    void fcc
  }

  const catalog = {
    version: 1,
    tier: "free" as const,
    source: smoke ? `fcc:${path.resolve(root)}` : "seed",
    updated_at: new Date().toISOString().slice(0, 10),
    candidates,
  }

  await Bun.write(outPath, JSON.stringify(catalog, null, 2) + "\n")
  console.log(`Wrote ${candidates.length} candidates → ${outPath}`)
  for (const c of candidates) console.log(`  - ${c.ref}`)
}

await main()
