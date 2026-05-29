"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Persisted sort key for any results panel.
 *
 * Mirrors the useTriadView pattern from ADR-0003: sticky per-user pref via
 * localStorage, page-scoped so /intel and /tracker can persist independently.
 * Default supplied per-page; user override survives reloads.
 *
 * Conceptual integrity with useTriadView is intentional — one mental model for
 * "page-scoped persisted UI state" across the product.
 */

export type ResultsSortKey =
  | "velocity"   // week-over-week delta in created_at bins
  | "open"       // raw open-role count
  | "recency"    // most recently updated (last_seen)
  | "alpha"      // company name A→Z

export interface ResultsSortSemantics {
  key: ResultsSortKey
  label: string
}

export const RESULTS_SORT: Record<ResultsSortKey, ResultsSortSemantics> = {
  velocity: { key: "velocity", label: "Hiring velocity" },
  open:     { key: "open",     label: "Open roles" },
  recency:  { key: "recency",  label: "Most recently updated" },
  alpha:    { key: "alpha",    label: "A → Z" },
}

export const RESULTS_SORT_OPTIONS: ResultsSortSemantics[] = [
  RESULTS_SORT.velocity,
  RESULTS_SORT.open,
  RESULTS_SORT.recency,
  RESULTS_SORT.alpha,
]

const STORAGE_PREFIX = "tm.sort."

function storageKey(page: string): string {
  return `${STORAGE_PREFIX}${page}`
}

export function useResultsSort(
  page: string,
  defaultKey: ResultsSortKey = "velocity",
): { sort: ResultsSortKey; setSort: (k: ResultsSortKey) => void } {
  const [sort, setSortState] = useState<ResultsSortKey>(defaultKey)

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(storageKey(page))
      if (raw && raw in RESULTS_SORT) {
        setSortState(raw as ResultsSortKey)
      }
    } catch {}
  }, [page])

  const setSort = useCallback((next: ResultsSortKey) => {
    setSortState(next)
    try {
      window.localStorage.setItem(storageKey(page), next)
    } catch {}
  }, [page])

  return { sort, setSort }
}
