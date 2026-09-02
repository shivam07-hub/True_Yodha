"use client"

import { useMemo } from "react"
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { jobs as jobsApi, type CollectionEntry, type CollectionResponse, type CollectionStage } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

/**
 * The Collection Record, read once (CONTEXT.md → Collection Record).
 *
 * This replaces the three queries each Collections skin used to make —
 * `/jobs/applications`, `/jobs/matches`, `/jobs/pulses` — and the partition
 * both then derived from them independently. The server owns the stage, the
 * counts and the landing; nothing here re-derives any of it.
 */
export const STAGE_CHIPS: ReadonlyArray<{ key: CollectionStage; label: string }> = [
  { key: "found", label: "Myro found" },
  { key: "saved", label: "Saved" },
  // The goal step. It used to have no chip at all — the "Finish tailoring" lane
  // lived on /cv, so the surface that owns "download the CV" never showed it.
  { key: "tailored", label: "Tailored" },
  { key: "applied", label: "Applied" },
  { key: "closed", label: "Closed" },
]

export interface CollectionView {
  query: UseQueryResult<CollectionResponse>
  entries: CollectionEntry[]
  byStage: (stage: CollectionStage) => CollectionEntry[]
  byId: ReadonlyMap<string, CollectionEntry>
  counts: Record<CollectionStage, number>
  landing: CollectionStage
  belowBarCount: number
  rejectedCount: number
  /** Entries whose apply click was never answered — the surface owes them a question. */
  pendingApply: CollectionEntry[]
  isEmpty: boolean
}

const EMPTY_COUNTS: Record<CollectionStage, number> = {
  found: 0, saved: 0, tailored: 0, applied: 0, closed: 0,
}

export function useCollection(token: string | null): CollectionView {
  const query = useQuery({
    queryKey: dataKeys.collection(),
    queryFn: () => jobsApi.collection(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  const entries = useMemo(() => query.data?.entries ?? [], [query.data])

  const grouped = useMemo(() => {
    const map = new Map<CollectionStage, CollectionEntry[]>()
    for (const entry of entries) {
      const bucket = map.get(entry.stage)
      if (bucket) bucket.push(entry)
      else map.set(entry.stage, [entry])
    }
    return map
  }, [entries])

  const byId = useMemo(() => {
    const map = new Map<string, CollectionEntry>()
    for (const entry of entries) map.set(entry.job_id, entry)
    return map
  }, [entries])

  const pendingApply = useMemo(() => entries.filter((e) => e.pending_apply), [entries])

  return {
    query,
    entries,
    byStage: (stage) => grouped.get(stage) ?? [],
    byId,
    counts: query.data?.stages ?? EMPTY_COUNTS,
    landing: query.data?.landing ?? "found",
    belowBarCount: query.data?.below_bar_count ?? 0,
    rejectedCount: query.data?.rejected_count ?? 0,
    pendingApply,
    isEmpty: !query.isLoading && entries.length === 0,
  }
}
