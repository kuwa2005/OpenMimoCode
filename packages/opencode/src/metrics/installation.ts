import path from "path"
import { Global } from "@/global"
import { Flag } from "@/flag/flag"
import { Filesystem } from "@/util"

let cached: string | undefined

export async function getInstallationID(): Promise<string> {
  if (Flag.MIMOCODE_RANDOM_UUID) {
    if (cached) return cached
    cached = crypto.randomUUID()
    return cached
  }
  if (cached) return cached
  const file = path.join(Global.Path.data, "installation_id")
  const existing = await Filesystem.readText(file).catch(() => undefined)
  if (existing && existing.trim()) {
    cached = existing.trim()
    return cached
  }
  cached = crypto.randomUUID()
  await Filesystem.write(file, cached)
  return cached
}
