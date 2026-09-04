/** Shared yargs describe for `--character` (TUI default command + session list). */
export const CHARACTER_CLI_HELP =
  "愚痴モード (Friction フィードバック表示)。未指定=OFF、--character=ON、--character=off で明示 OFF"

export const CharacterMode = {
  Default: "default",
  Off: "off",
} as const

export type CharacterMode = (typeof CharacterMode)[keyof typeof CharacterMode]

/** Implemented presentation variants (--character or --character=default). */
const IMPLEMENTED = [CharacterMode.Default, CharacterMode.Off] as const

/** Reserved for future renderers (--character=osaka, etc.). */
const RESERVED = ["osaka", "tsundere"] as const

export function availableCharacterModes(): readonly string[] {
  return IMPLEMENTED
}

export function isCharacterMode(value: string): value is CharacterMode {
  return (IMPLEMENTED as readonly string[]).includes(value)
}

export function characterDisplayEnabled(mode: CharacterMode | string): boolean {
  return mode !== CharacterMode.Off
}

/**
 * CLI / env value → mode. Unset env defaults to off (no --character).
 * `--character` alone → default (empty string normalizes to default).
 */
export function parseCharacterMode(value?: string | null): CharacterMode {
  if (value == null) return CharacterMode.Off
  if (value === "" || value === CharacterMode.Default) return CharacterMode.Default
  const v = value.trim().toLowerCase()
  if (v === CharacterMode.Off) return CharacterMode.Off
  if (v === "on") {
    throw new Error(`Unknown character mode: on\nUse --character alone for default, or --character=off to disable.`)
  }
  if ((RESERVED as readonly string[]).includes(v)) {
    throw new Error(
      `Character variant "${value}" is not implemented yet.\nUse --character alone for default tone. Planned: ${RESERVED.join(", ")}.`,
    )
  }
  if (!isCharacterMode(v)) {
    throw new Error(`Unknown character mode: ${value}\nAvailable: (omit) off | --character → default | --character=off`)
  }
  return v
}

/** Normalize yargs `--character` (undefined | "" | "default" | "off" | future). */
export function resolveCharacterCli(raw: string | undefined): CharacterMode {
  if (raw === undefined) return CharacterMode.Off
  return parseCharacterMode(raw)
}

/** Validate CLI string; returns error message or undefined. */
export function validateCharacterArg(value: string | undefined): string | undefined {
  if (value === undefined) return
  try {
    parseCharacterMode(value)
    return
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
