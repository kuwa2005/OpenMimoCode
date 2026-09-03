import { createSimpleContext } from "./helper"

export interface Args {
  model?: string
  agent?: string
  prompt?: string
  continue?: boolean
  sessionID?: string
  fork?: boolean
  neverAsk?: boolean
  /** SE-style autonomy (hearing-first). Implies compose agent when unset. */
  autonomy?: boolean
  /** Forward Deployed Engineer (--fde): hearing + Solution Lock; PoC before lock. */
  fde?: boolean
  /** Super Auto (--spauto / --autosp): autonomy without hearing; never-ask from turn one. */
  spauto?: boolean
}

export const { use: useArgs, provider: ArgsProvider } = createSimpleContext({
  name: "Args",
  init: (props: Args) => props,
})
