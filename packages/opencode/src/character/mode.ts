export const CharacterMode = {
  Default: "default",
  Off: "off",
} as const

export type CharacterMode = (typeof CharacterMode)[keyof typeof CharacterMode]

const AVAILABLE = [CharacterMode.Default, CharacterMode.Off] as const

export function availableCharacterModes(): readonly string[] {
  return AVAILABLE
}

export function isCharacterMode(value: string): value is CharacterMode {
  return (AVAILABLE as readonly string[]).includes(value)
}

export function parseCharacterMode(value?: string | null): CharacterMode {
  if (value == null || value === "") return CharacterMode.Default
  const v = value.trim().toLowerCase()
  if (v === "on") {
    throw new Error(`Unknown character mode: on\nAvailable modes: ${AVAILABLE.join(", ")}`)
  }
  if (!isCharacterMode(v)) {
    throw new Error(`Unknown character mode: ${value}\nAvailable modes: ${AVAILABLE.join(", ")}`)
  }
  return v
}

/** Validate CLI string; returns error message or undefined. */
export function validateCharacterArg(value: string): string | undefined {
  try {
    parseCharacterMode(value)
    return
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
