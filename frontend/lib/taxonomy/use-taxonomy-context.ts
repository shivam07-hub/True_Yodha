"use client"

import { useEffect, useMemo, useSyncExternalStore } from "react"
import { createTaxonomy, type TaxonomyView, type TaxonomySources } from "./taxonomy"

const SOURCES: TaxonomySources = {
  skeletonUrl: "/data/taxonomy_skeleton.json",
  priorityUrl: "/data/taxonomy_priority.json",
  indexUrl: "/data/skill_taxonomy.json",
}

/**
 * Structure-only taxonomy view — the shape of the catalogue without the
 * catalogue itself.
 *
 * The public browser needs the full 4MB leaf index because it lets you search
 * all 35,108 skills. A drill-down into ONE skill does not: the backend already
 * tells us the skill's domain and cluster (`by_domain` / `by_cluster`), so all
 * we need is the SCALE around it — how many clusters the domain holds, how many
 * skills the cluster holds, and the demand band. That lives entirely in the
 * 19K skeleton + 383K priority tiers.
 *
 * The engine schedules the heavy index through the injected `scheduleIdle`, so
 * a scheduler that never fires is all it takes to opt out — no engine change,
 * and 4MB never crosses a mobile connection to answer a question it can't
 * answer. `search()` is inert here by design; use the /taxonomy browser for
 * lookups across the full corpus.
 */
export function useTaxonomyContext(): TaxonomyView {
  const engine = useMemo(
    () => createTaxonomy(SOURCES, { scheduleIdle: () => () => {} }),
    [],
  )
  useEffect(() => {
    engine.start()
    return () => engine.destroy()
  }, [engine])
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
}
