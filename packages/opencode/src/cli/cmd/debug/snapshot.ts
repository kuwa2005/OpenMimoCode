import { AppRuntime } from "@/effect/app-runtime"
import { Snapshot } from "../../../snapshot"
import { bootstrap } from "../../bootstrap"
import { cmd } from "../cmd"

export const SnapshotCommand = cmd({
  command: "snapshot",
  describe: "スナップショットのデバッグ用ユーティリティ",
  builder: (yargs) => yargs.command(TrackCommand).command(PatchCommand).command(DiffCommand).demandCommand(),
  async handler() {},
})

const TrackCommand = cmd({
  command: "track",
  describe: "現在のスナップショット状態を追跡",
  async handler() {
    await bootstrap(process.cwd(), async () => {
      console.log(await AppRuntime.runPromise(Snapshot.Service.use((svc) => svc.track())))
    })
  },
})

const PatchCommand = cmd({
  command: "patch <hash>",
  describe: "スナップショットハッシュのパッチを表示",
  builder: (yargs) =>
    yargs.positional("hash", {
      type: "string",
      description: "ハッシュ",
      demandOption: true,
    }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      console.log(await AppRuntime.runPromise(Snapshot.Service.use((svc) => svc.patch(args.hash))))
    })
  },
})

const DiffCommand = cmd({
  command: "diff <hash>",
  describe: "スナップショットハッシュの差分を表示",
  builder: (yargs) =>
    yargs.positional("hash", {
      type: "string",
      description: "ハッシュ",
      demandOption: true,
    }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      console.log(await AppRuntime.runPromise(Snapshot.Service.use((svc) => svc.diff(args.hash))))
    })
  },
})
