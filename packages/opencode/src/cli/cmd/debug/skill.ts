import { EOL } from "os"
import { Effect } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { Skill } from "../../../skill"
import { bootstrap } from "../../bootstrap"
import { cmd } from "../cmd"

export const SkillCommand = cmd({
  command: "skill",
  describe: "利用可能なスキルをすべて一覧表示",
  builder: (yargs) => yargs,
  async handler() {
    await bootstrap(process.cwd(), async () => {
      const skills = await AppRuntime.runPromise(
        Effect.gen(function* () {
          const skill = yield* Skill.Service
          return yield* skill.all()
        }),
      )
      process.stdout.write(JSON.stringify(skills, null, 2) + EOL)
    })
  },
})
