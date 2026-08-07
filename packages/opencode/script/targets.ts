export type Target = {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}

export const ALL_TARGETS: Target[] = [
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "x64", avx2: false },
  { os: "linux", arch: "arm64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl", avx2: false },
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "darwin", arch: "x64", avx2: false },
  { os: "win32", arch: "arm64" },
  { os: "win32", arch: "x64" },
  { os: "win32", arch: "x64", avx2: false },
]

export function targetName(item: Target): string {
  return [
    "oimo",
    // changing to win32 flags npm for some reason
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")
}

export function filterTargets(targets: Target[], filter: string[]): Target[] {
  if (filter.length === 0) return targets
  return targets.filter((item) => {
    const name = targetName(item)
    return filter.includes(name) || filter.includes(name.replace(/^oimo-/, ""))
  })
}
