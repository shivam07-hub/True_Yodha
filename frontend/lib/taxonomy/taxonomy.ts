/**
 * Taxonomy read-model — headless engine for the /taxonomy page (CONTEXT.md
 * "Taxonomy Read-Model"). Owns the THREE-TIER orchestration so the page never
 * blocks on one 4MB fetch again:
 *
 *   structure  taxonomy_skeleton.json   domains -> clusters -> count (no leaves)
 *   priority   taxonomy_priority.json   the in-demand set + DemandBand (sole carrier)
 *   index      skill_taxonomy.json      full 35,108 leaves (search + long tail)
 *
 * The bug surface is the orchestration (load order, the idle-fired index fetch,
 * the demand join, search-over-the-right-tier), so the engine owns it and is
 * unit-testable in Node with a fake `fetchJson`/`scheduleIdle` — no DOM. The
 * React layer (use-taxonomy.ts) is a thin useSyncExternalStore adapter; the page
 * is a pure renderer. Precedent: components/loading/field-motion.ts.
 */

import type { DemandBand } from "@/lib/api"

export type TierState = "pending" | "ready" | "error"
export interface Readiness {
  structure: TierState
  priority: TierState
  index: TierState
}

// ── Artifact shapes ──────────────────────────────────────────────────────────
interface SkeletonCluster { name: string; n: number }
interface SkeletonDomain { name: string; clusters: SkeletonCluster[] }
export interface Skeleton { children: SkeletonDomain[] }

export interface PrioritySkill { name: string; domain: string; cluster: string; band: DemandBand }
interface Priority { skills: PrioritySkill[] }

interface FullSkill { name: string; id?: string }
interface FullCluster { name: string; children: FullSkill[] }
interface FullDomain { name: string; children: FullCluster[] }
interface FullTaxonomy { children: FullDomain[] }

// ── Read-model surface the renderer consumes ────────────────────────────────
export interface DomainRow { name: string; clusters: number; skills: number }
export interface SkillChip { name: string; band: DemandBand | null }
export interface SearchHit { name: string; domain: string; cluster: string; band: DemandBand | null }
export interface ClusterSkills { skills: SkillChip[]; complete: boolean }

export interface TaxonomyView {
  /** Bumps only when state changes — the useSyncExternalStore identity. */
  version: number
  readiness: Readiness
  stats: { domains: number; clusters: number; skills: number } | null
  domains: DomainRow[]
  /** The in-demand set, already sorted by demand — leads the page. */
  inDemand: SearchHit[]
  clustersOf: (domain: string) => SkeletonCluster[]
  skillsForCluster: (domain: string, cluster: string) => ClusterSkills
  demandOf: (name: string) => DemandBand | null
  /** null when query < 2 chars. scope tells the UI whether to show "indexing…". */
  search: (q: string) => { hits: SearchHit[]; scope: "priority" | "all" } | null
}

export interface TaxonomySources { skeletonUrl: string; priorityUrl: string; indexUrl: string }
export interface TaxonomyDeps {
  fetchJson: (url: string) => Promise<unknown>
  /** Schedule the background index fetch; returns a cancel fn. DI'd for tests. */
  scheduleIdle: (cb: () => void) => () => void
}

const SEARCH_LIMIT = 80

function defaultScheduleIdle(cb: () => void): () => void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = (window as unknown as {
      requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number
    }).requestIdleCallback(cb, { timeout: 2500 })
    return () => (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(id)
  }
  const t = setTimeout(cb, 1)
  return () => clearTimeout(t)
}

export function createTaxonomy(sources: TaxonomySources, deps: Partial<TaxonomyDeps> = {}) {
  const fetchJson = deps.fetchJson ?? ((url: string) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }))
  const scheduleIdle = deps.scheduleIdle ?? defaultScheduleIdle

  const readiness: Readiness = { structure: "pending", priority: "pending", index: "pending" }
  let skeleton: Skeleton | null = null
  let priority: Priority | null = null
  let full: FullTaxonomy | null = null

  let demandMap = new Map<string, DemandBand>()        // priority name -> band (sole carrier)
  let priorityFlat: SearchHit[] = []
  let fullFlat: SearchHit[] | null = null              // built once, when index ready

  let version = 0
  let view: TaxonomyView = buildView()
  const listeners = new Set<() => void>()
  let cancelIdle: (() => void) | null = null
  let indexScheduled = false
  let indexStarted = false
  let destroyed = false

  function emit() {
    version += 1
    view = buildView()
    listeners.forEach((l) => l())
  }

  function buildView(): TaxonomyView {
    const skel = skeleton
    const stats = skel
      ? {
          domains: skel.children.length,
          clusters: skel.children.reduce((a, d) => a + d.clusters.length, 0),
          skills: skel.children.reduce((a, d) => a + d.clusters.reduce((b, c) => b + c.n, 0), 0),
        }
      : null

    const domains: DomainRow[] = skel
      ? skel.children.map((d) => ({
          name: d.name,
          clusters: d.clusters.length,
          skills: d.clusters.reduce((a, c) => a + c.n, 0),
        }))
      : []

    const dMap = demandMap
    const pFlat = priorityFlat
    const fFlat = fullFlat
    const indexReady = readiness.index === "ready"

    return {
      version,
      readiness: { ...readiness },
      stats,
      domains,
      inDemand: pFlat,
      clustersOf: (domain) => skel?.children.find((d) => d.name === domain)?.clusters ?? [],
      demandOf: (name) => dMap.get(name) ?? null,
      skillsForCluster: (domain, cluster) => {
        const priorityChips: SkillChip[] = pFlat
          .filter((s) => s.domain === domain && s.cluster === cluster)
          .map((s) => ({ name: s.name, band: s.band }))
        if (!indexReady || !full) return { skills: priorityChips, complete: false }
        const leaves =
          full.children.find((d) => d.name === domain)?.children.find((c) => c.name === cluster)
            ?.children ?? []
        const seen = new Set(priorityChips.map((c) => c.name))
        const rest: SkillChip[] = leaves
          .filter((l) => !seen.has(l.name))
          .map((l) => ({ name: l.name, band: dMap.get(l.name) ?? null }))
        return { skills: [...priorityChips, ...rest], complete: true }
      },
      search: (q) => {
        const term = q.trim().toLowerCase()
        if (term.length < 2) return null
        const source = indexReady && fFlat ? fFlat : pFlat
        const scope: "priority" | "all" = indexReady && fFlat ? "all" : "priority"
        const hits: SearchHit[] = []
        for (const s of source) {
          if (s.name.toLowerCase().includes(term)) {
            hits.push(s)
            if (hits.length >= SEARCH_LIMIT) break
          }
        }
        return { hits, scope }
      },
    }
  }

  function onSkeleton(raw: unknown) {
    skeleton = raw as Skeleton
    readiness.structure = "ready"
    emit()
  }

  function onPriority(raw: unknown) {
    priority = raw as Priority
    const map = new Map<string, DemandBand>()
    const flat: SearchHit[] = []
    for (const s of priority.skills) {
      // Re-derive the band from a known carrier if absent, so the artifact can
      // ship either {band} or a raw count without the engine caring.
      const band = s.band ?? "none"
      map.set(s.name, band)
      flat.push({ name: s.name, domain: s.domain, cluster: s.cluster, band })
    }
    demandMap = map
    priorityFlat = flat
    readiness.priority = "ready"
    emit()
    // Tier 3 fires on idle AFTER priority — exactly once, even on a double-fire.
    if (!indexScheduled) {
      indexScheduled = true
      cancelIdle = scheduleIdle(() => {
        if (destroyed || indexStarted) return
        indexStarted = true
        fetchJson(sources.indexUrl).then(onIndex).catch(() => {
          readiness.index = "error"
          emit()
        })
      })
    }
  }

  function onIndex(raw: unknown) {
    full = raw as FullTaxonomy
    const flat: SearchHit[] = []
    for (const d of full.children)
      for (const c of d.children)
        for (const s of c.children)
          flat.push({ name: s.name, domain: d.name, cluster: c.name, band: demandMap.get(s.name) ?? null })
    fullFlat = flat
    readiness.index = "ready"
    emit()
  }

  return {
    getSnapshot: (): TaxonomyView => view,
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    start() {
      fetchJson(sources.skeletonUrl).then(onSkeleton).catch(() => {
        readiness.structure = "error"
        emit()
      })
      fetchJson(sources.priorityUrl).then(onPriority).catch(() => {
        readiness.priority = "error"
        emit()
      })
    },
    destroy() {
      destroyed = true
      cancelIdle?.()
      listeners.clear()
    },
  }
}

export type TaxonomyEngine = ReturnType<typeof createTaxonomy>
