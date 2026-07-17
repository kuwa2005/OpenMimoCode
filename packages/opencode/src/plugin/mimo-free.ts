import type { Hooks, PluginInput } from "@mimo-ai/plugin"
import { Log } from "../util"
import { Global } from "../global"
import crypto from "crypto"
import os from "os"
import path from "path"
import fs from "fs"

const log = Log.create({ service: "plugin.mimo-free" })

const DEFAULT_BASE_URL = "https://api.xiaomimimo.com/"
const BASE_URL = (process.env.MIMO_FREE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "")
const BOOTSTRAP_URL = `${BASE_URL}/api/free-ai/bootstrap`
const CHAT_BASE_URL = `${BASE_URL}/api/free-ai/openai`

// Stable, anonymous device fingerprint. Persisted so the free tier can rate
// limit per-device without any account. Derived from non-PII host attributes.
let fingerprintCache: string | undefined
function fingerprint(): string {
  if (fingerprintCache) return fingerprintCache
  const file = path.join(Global.Path.data, "mimo-free-client")
  try {
    const existing = fs.readFileSync(file, "utf-8").trim()
    if (existing) return (fingerprintCache = existing)
  } catch {}
  const cpu = os.cpus()[0]?.model ?? "unknown-cpu"
  const user = (() => {
    try {
      return os.userInfo().username
    } catch {
      return "unknown-user"
    }
  })()
  const seed = [os.hostname(), "linux", "x64", cpu, user].join("|")
  const digest = crypto.createHash("sha256").update(seed).digest("hex")
  try {
    fs.writeFileSync(file, digest, { mode: 0o600 })
  } catch (error) {
    log.warn("could not persist fingerprint", { error })
  }
  return (fingerprintCache = digest)
}

type Token = { jwt: string; exp: number }

let token: Token | null = null
let inflight: Promise<Token> | null = null

const FALLBACK_TTL_MS = 50 * 60 * 1000
const REFRESH_MARGIN_MS = 5 * 60 * 1000

function jwtExpiry(jwt: string): number {
  const parts = jwt.split(".")
  if (parts.length < 2) return Date.now() + FALLBACK_TTL_MS
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"))
    if (typeof payload.exp === "number") return payload.exp * 1000
  } catch {}
  return Date.now() + FALLBACK_TTL_MS
}

async function bootstrap(): Promise<Token> {
  const res = await fetch(BOOTSTRAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client: fingerprint() }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`mimo-free bootstrap failed: ${res.status} ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { jwt?: string }
  if (!data.jwt) throw new Error("mimo-free bootstrap response missing jwt")
  return { jwt: data.jwt, exp: jwtExpiry(data.jwt) }
}

async function jwt(): Promise<string> {
  if (token && token.exp - Date.now() > REFRESH_MARGIN_MS) return token.jwt
  if (inflight) return (await inflight).jwt
  token = null
  inflight = bootstrap()
  try {
    return (token = await inflight).jwt
  } finally {
    inflight = null
  }
}

function withAuth(init: RequestInit | undefined, bearer: string): Headers {
  const headers = new Headers(init?.headers)
  headers.set("Authorization", `Bearer ${bearer}`)
  headers.set("X-Mimo-Source", "mimocode-cli-free")
  return headers
}

async function freeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = (typeof input === "string" || input instanceof URL ? String(input) : input.url).replace(
    /\/chat\/completions(\?|$)/,
    "/chat$1",
  )
  const first = await fetch(url, { ...init, headers: withAuth(init, await jwt()) })
  if (first.status !== 401 && first.status !== 403) return first
  // Token rejected: force a fresh bootstrap and retry once.
  token = null
  return fetch(url, { ...init, headers: withAuth(init, await jwt()) })
}

export const MimoFree = {
  baseUrl: BASE_URL,
  bootstrapUrl: BOOTSTRAP_URL,
  chatBaseUrl: CHAT_BASE_URL,
  fingerprint: () => fingerprint(),
  async verify() {
    token = null
    const fresh = await bootstrap()
    token = fresh
    return { jwt: fresh.jwt, exp: fresh.exp, fingerprint: fingerprint() }
  },
}

export async function MimoFreeAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    config: async (input) => {
      input.provider ??= {}
      input.provider.mimo ??= {
        name: "MiMo Auto (free)",
        npm: "@ai-sdk/openai-compatible",
        api: CHAT_BASE_URL,
        options: { apiKey: "anonymous", fetch: freeFetch },
        models: {
          "mimo-auto": {
            name: "MiMo Auto",
            attachment: true,
            reasoning: true,
            tool_call: true,
            temperature: true,
            modalities: { input: ["text", "image"], output: ["text"] },
            limit: { context: 1_000_000, output: 128_000 },
            cost: { input: 0, output: 0 },
          },
        },
      }
    },
  }
}
