"use client"

import { useEffect, useMemo, useSyncExternalStore } from "react"
import { createTaxonomy, type TaxonomyView, type TaxonomySources } from "./taxonomy"

const SOURCES: TaxonomySources = {
  skeletonUrl: "/data/taxonomy_skeleton.json",
  priorityUrl: "/data/taxonomy_priority.json",
  indexUrl: "/data/skill_taxonomy.json",
}

/**
 * Thin React adapter over the headless Taxonomy engine. All orchestration,
 * indexing, and the demand join live in the engine (testable in Node); this hook
 * only binds it to the render tree via useSyncExternalStore and starts/tears it
 * down. The page reads the returned TaxonomyView and stays a pure renderer.
 */
export function useTaxonomy(): TaxonomyView {
  const engine = useMemo(() => createTaxonomy(SOURCES), [])
  useEffect(() => {
    engine.start()
    return () => engine.destroy()
  }, [engine])
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
}
