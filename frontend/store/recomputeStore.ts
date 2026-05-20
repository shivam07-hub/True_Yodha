import { create } from "zustand"

/**
 * Tracks whether a CV skill-edit save is waiting on its async re-tag + score
 * recompute to land. ScoreRing reads `pendingBaselineId` to apply the shimmer
 * style (SE4=A). The card sets it on a successful save and clears it once the
 * recompute_finished_at poll succeeds (SE17).
 */
interface RecomputeStore {
  pendingBaselineId: number | null
  start: (baselineId: number) => void
  clear: () => void
}

export const useRecomputeStore = create<RecomputeStore>((set) => ({
  pendingBaselineId: null,
  start: (baselineId) => set({ pendingBaselineId: baselineId }),
  clear: () => set({ pendingBaselineId: null }),
}))
