#!/usr/bin/env bun

export async function sha256Sums(files: string[]): Promise<string> {
  const lines = await Promise.all(
    files
      .slice()
      .sort()
      .map(async (file) => {
        const hash = new Bun.CryptoHasher("sha256").update(await Bun.file(file).arrayBuffer()).digest("hex")
        const name = file.split("/").pop()
        return `${hash}  ${name}`
      }),
  )
  return `${lines.join("\n")}\n`
}

if (import.meta.main) {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error("Usage: bun script/checksums.ts <file...>")
    process.exit(1)
  }
  process.stdout.write(await sha256Sums(files))
}
