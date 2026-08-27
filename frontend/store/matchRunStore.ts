import { create } from "zustand"

/**
 * Match-run lane — ranking is J0.
 *
 * A paid Myro Search holds the LLM budget and the shared DB. While it does,
 * every other Market fetch (feed warm, pulses, skill-demand, companies-at,
 * a profile-driven feed refetch) yields. ARCHITECTURE_READ_PATH's
 * journey-compute contract: the decision the user is making is the search;
 * "the component mounted" is not permission to compete with it.
 *
 * `ranking` — Job Refresh is charging / queued / computing.
 * `hold`    — the search modal is still showing the run (including done).
 *             Secondary work stays paused until they look at the matches,
 *             so "Run complete" cannot fire a 73s warm behind the glass.
 */

interface MatchRunLane {
  ranking: boolean
  hold: boolean
  setRanking: (live: boolean) => void
  setHold: (held: boolean) => void
}

export const useMatchRunStore = create<MatchRunLane>((set) => ({
  ranking: false,
  hold: false,
  setRanking: (ranking) => set({ ranking }),
  setHold: (hold) => set({ hold }),
}))

export function useLaneYields(): boolean {
  return useMatchRunStore((s) => s.ranking || s.hold)
}
