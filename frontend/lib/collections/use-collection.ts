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
  /** NULL until the record lands. Chips render count-less rather than showing a
   *  confident 0 that then jumps to 75 — the same rule the nav's `TabCount`
   *  already follows. A zero is an answer; "not yet" is not. */
  counts: Record<CollectionStage, number> | null
  /** NULL until the record lands. It used to fall back to `found`, so the page
   *  opened on a guess and then moved the active chip under the user a second
   *  later (found → applied on a real board). */
  landing: CollectionStage | null
  belowBarCount: number
  rejectedCount: number
  /** Entries whose apply click was never answered — the surface owes them a question. */
  pendingApply: CollectionEntry[]
  /** No record yet. Distinct from `isEmpty`, which is a VERDICT about the data. */
  isLoading: boolean
  /** The record arrived and it holds nothing. Never true before it arrives. */
  isEmpty: boolean
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
    counts: query.data?.stages ?? null,
    landing: query.data?.landing ?? null,
    belowBarCount: query.data?.below_bar_count ?? 0,
    rejectedCount: query.data?.rejected_count ?? 0,
    pendingApply,
    // Keyed on the DATA, not on `isLoading` — a background refetch holds the
    // previous record, and the surface must keep rendering it rather than
    // blanking to a skeleton every 60 seconds.
    isLoading: query.data === undefined,
    isEmpty: query.data !== undefined && entries.length === 0,
  }
}
