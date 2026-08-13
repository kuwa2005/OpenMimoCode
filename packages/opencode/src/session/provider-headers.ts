/**
 * OpenCode Zen (`opencode.ai/zen`) gates the high-throughput free pool
 * (Big Pickle etc.) on request headers matching the official client.
 * `checkHeaders` is a case-insensitive substring match against User-Agent
 * / `x-opencode-client`. Sending `oimo/...` or omitting `x-opencode-*`
 * routes the call into `dailyRequestsFallback`, which exhausts almost
 * immediately. See anomalyco/opencode#28807.
 */

function installationVersion(): string {
  return typeof MIMOCODE_VERSION === "string" ? MIMOCODE_VERSION : "local"
}

/** Brand UA for non-Zen providers. */
export function oimoUserAgent(version = installationVersion()): string {
  return `oimo/${version}`
}

/** Official-compatible UA for OpenCode Zen. */
export function zenUserAgent(version = installationVersion()): string {
  return `opencode/${version}`
}

export const OIMO_USER_AGENT = oimoUserAgent()
export const ZEN_USER_AGENT = zenUserAgent()

export type ProviderHeaderInput = {
  providerID: string
  sessionID?: string
  requestID?: string
  parentSessionID?: string
  projectID?: string
  /** Surface id. Official OpenCode sends `cli` / `desktop` / `app` / `acp`. */
  client?: string
  extra?: Record<string, string | undefined>
}

function compact(headers: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  )
}

/**
 * Outbound HTTP headers for a model call.
 *
 * - OpenCode Zen (`providerID` starts with `opencode`): official-compatible
 *   identity + session affinity headers so free models are not dumped into
 *   the fallback rate-limit pool.
 * - Everything else: oimo User-Agent + session affinity only.
 *
 * Caller-supplied `extra` (model / plugin headers) is applied first so Zen
 * identity fields always win.
 */
export function providerRequestHeaders(input: ProviderHeaderInput): Record<string, string> {
  const extra = compact(input.extra ?? {})
  const client = input.client ?? process.env["MIMOCODE_CLIENT"] ?? "cli"
  const version = installationVersion()

  if (input.providerID.startsWith("opencode")) {
    return {
      ...extra,
      ...compact({
        ...(input.projectID ? { "x-opencode-project": input.projectID } : {}),
        ...(input.sessionID ? { "x-opencode-session": input.sessionID } : {}),
        ...(input.requestID ? { "x-opencode-request": input.requestID } : {}),
        "x-opencode-client": client,
        "User-Agent": zenUserAgent(version),
      }),
    }
  }

  return {
    ...extra,
    ...compact({
      ...(input.sessionID ? { "x-session-affinity": input.sessionID } : {}),
      ...(input.parentSessionID ? { "x-parent-session-id": input.parentSessionID } : {}),
      "User-Agent": oimoUserAgent(version),
    }),
  }
}
