import { describe, test, expect } from "bun:test"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { launchFlags } from "../../src/cli/cmd/session"

const ROOT = path.join(import.meta.dir, "..", "..")

async function runCli(args: string[], home: string) {
  const proc = Bun.spawn([process.execPath, "src/index.ts", ...args], {
    cwd: ROOT,
    env: { ...process.env, MIMOCODE_HOME: home, MIMOCODE_DISABLE_CLAUDE_IMPORT: "1" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const exitCode = await proc.exited
  return { exitCode, stdout, stderr }
}

describe("cli help localization", () => {
  test("T1: every describe literal in cli/cmd contains Japanese characters", async () => {
    const targets = ["src/cli/cmd/**/*.ts", "src/cli/cmd/**/*.tsx", "src/cli/network.ts", "src/index.ts"]
    const files = new Set<string>()
    for (const pattern of targets) {
      for (const f of new Bun.Glob(pattern).scanSync({ cwd: ROOT })) files.add(path.join(ROOT, f))
    }
    expect(files.size).toBeGreaterThan(20)

    const missing: string[] = []
    for (const file of files) {
      const src = await Bun.file(file).text()
      for (const m of src.matchAll(/describe:\s*"([^"]*)"/g)) {
        if (m[1].trim() && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(m[1])) {
          missing.push(`${path.relative(ROOT, file)}: ${m[1]}`)
        }
      }
      for (const m of src.matchAll(/describe:\s*`([^`]*)`/g)) {
        if (m[1].trim() && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(m[1])) {
          missing.push(`${path.relative(ROOT, file)}: ${m[1]}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  test("T2: oimo --help renders Japanese headings, commands and examples", async () => {
    await using tmp = await tmpdir()
    const { exitCode, stderr } = await runCli(["--help"], tmp.path)
    expect(exitCode).toBe(0)
    expect(stderr).toContain("oimo <コマンド> [オプション]")
    expect(stderr).toContain("コマンド:")
    expect(stderr).toContain("オプション:")
    expect(stderr).toContain("例:")
    expect(stderr).toContain("セッションを管理する")
    expect(stderr).toContain("ヘルプを表示")
    expect(stderr).toContain("愚痴モード")
    expect(stderr).not.toContain("Commands:")
  })

  test("T3: subcommand help is Japanese (run / session list / default TUI)", async () => {
    await using tmp = await tmpdir()
    const run = await runCli(["run", "--help"], tmp.path)
    expect(run.exitCode).toBe(0)
    expect(run.stderr).toContain("オプション:")
    expect(run.stderr).toContain("生の JSON イベント")

    const session = await runCli(["session", "list", "--help"], tmp.path)
    expect(session.exitCode).toBe(0)
    expect(session.stderr).toContain("セッションを一覧表示し、選択して TUI で起動する")
    expect(session.stderr).toContain("直近のセッションを TUI で続行")
    expect(session.stderr).toContain("自動許可 (dangerous)")
    expect(session.stderr).toContain("SE 自律モード")

    const tui = await runCli(["tui", "--help"], tmp.path)
    expect(tui.exitCode).toBe(0)
    expect(tui.stderr).toContain("oimo TUI を起動する")
  })

  test("T4: unknown flag prints Japanese error + hint then help, exit 1", async () => {
    await using tmp = await tmpdir()
    const { exitCode, stderr } = await runCli(["session", "list", "--bogus"], tmp.path)
    expect(exitCode).toBe(1)
    expect(stderr).toContain("未知の引数です")
    expect(stderr).toContain("ヒント: `oimo --help`")
  })

  test("T5: session list accepts -c/--auto/--se without strict-parse help (non-TTY)", async () => {
    await using tmp = await tmpdir()
    const { exitCode, stderr } = await runCli(["session", "list", "-c", "--auto", "--se"], tmp.path)
    expect(exitCode).toBe(0)
    expect(stderr).not.toContain("コマンド:")
    expect(stderr).not.toContain("未知の引数です")
  })
})

describe("session list launch flags", () => {
  test("T6: launchFlags builds TUI launch flags", () => {
    expect(launchFlags({ auto: true, autonomy: true })).toEqual(["--auto", "--se"])
    expect(launchFlags({ auto: true })).toEqual(["--auto"])
    expect(launchFlags({ autonomy: true })).toEqual(["--se"])
    expect(launchFlags({ fde: true })).toEqual(["--fde"])
    expect(launchFlags({ auto: true, fde: true })).toEqual(["--auto", "--fde"])
    expect(launchFlags({ spauto: true })).toEqual(["--spauto"])
    expect(launchFlags({ auto: true, spauto: true })).toEqual(["--auto", "--spauto"])
    expect(launchFlags({ character: "" })).toEqual(["--character"])
    expect(launchFlags({ character: "off" })).toEqual(["--character=off"])
    expect(launchFlags({})).toEqual([])
  })
})
