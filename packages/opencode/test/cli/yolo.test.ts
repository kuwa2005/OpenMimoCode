import { describe, expect, test } from "bun:test"
import yargs from "yargs/yargs"
import { RunCommand } from "../../src/cli/cmd/run"
import { TuiThreadCommand } from "../../src/cli/cmd/tui/thread"
import { SessionListCommand } from "../../src/cli/cmd/session"

describe("--yolo", () => {
  test.each([
    ["tui", TuiThreadCommand],
    ["run", RunCommand],
    ["session list", SessionListCommand],
  ])("aliases --auto for %s", async (_name, command) => {
    if (typeof command.builder !== "function") throw new Error("command builder is not a function")

    const args = await (await command.builder(yargs([]))).parseAsync(["--yolo"])

    expect(args.auto).toBe(true)
    expect(args.yolo).toBe(true)
  })
})
