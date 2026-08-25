import type { TryBestOptions } from "@/session/try-best-detector"
import * as ConfigReliability from "@/config/reliability"
import { Flag } from "@/flag/flag"

/** Enable try-best monitoring via reliability.loop or the legacy handoff flag. */
export function enabled(cfg: { reliability?: ConfigReliability.Info }): boolean {
  if (Flag.MIMOCODE_ENABLE_TRY_BEST_HANDOFF) return true
  return ConfigReliability.feature(cfg, "loop")
}

/**
 * Slightly tighter defaults when reliability owns loop detection so
 * no-progress edit/verify streaks surface sooner.
 */
export function options(
  cfg: { reliability?: ConfigReliability.Info; experimental?: { try_best?: TryBestOptions } },
): TryBestOptions {
  const base = cfg.experimental?.try_best ?? {}
  if (!ConfigReliability.feature(cfg, "loop")) return base
  return {
    edit_window: base.edit_window,
    edit_similarity: base.edit_similarity,
    edit_matches: base.edit_matches,
    action_streak: base.action_streak ?? 3,
  }
}
