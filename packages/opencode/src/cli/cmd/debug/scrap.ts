import { EOL } from "os"
import { Project } from "../../../project"
import { Log } from "../../../util"
import { cmd } from "../cmd"

export const ScrapCommand = cmd({
  command: "scrap",
  describe: "既知のプロジェクトをすべて一覧表示",
  builder: (yargs) => yargs,
  async handler() {
    const timer = Log.Default.time("scrap")
    const list = await Project.list()
    process.stdout.write(JSON.stringify(list, null, 2) + EOL)
    timer.stop()
  },
})
