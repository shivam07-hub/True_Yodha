"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type CollectionEntry, type CollectionResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

/**
 * Every write the Collections surface makes, against ONE query key
 * (CONTEXT.md → Collection Record: "`GET /jobs/collections` is the surface's
 * only query key; every mutation writes the server's response back into it").
 *
 * These used to be three hooks writing `["applications"]` plus inline mutations
 * writing `["jobs"]`, on a surface that read both — so a heart could land in one
 * cache while the chip counting it read the other.
 */

const UNDO_WINDOW_MS = 6_000

/** Patch one entry in the cached record, optimistically. */
function patchEntry(
  current: CollectionResponse | undefined,
  jobId: string,
  patch: Partial<CollectionEntry>,
): CollectionResponse | undefined {
  if (!current) return current
  return {
    ...current,
    entries: current.entries.map((e) => (e.job_id === jobId ? { ...e, ...patch } : e)),
  }
}

export interface RemovalNotice {
  jobId: string
  kind: "undo" | "error"
}

export interface CollectionActions {
  saveNote: (jobId: string, note: string) => void
  /** Remove an entry from this list. ONE meaning at every stage, always undoable. */
  remove: (entry: CollectionEntry) => void
  /** Answer an unanswered apply click. `false` keeps it saved and stops asking. */
  answerPending: (jobId: string, submitted: boolean) => void
  undo: () => void
  notice: RemovalNotice | null
  clearNotice: () => void
}

export function useCollectionActions(token: string): CollectionActions {
  const qc = useQueryClient()
  const key = dataKeys.collection()
  const [notice, setNotice] = useState<RemovalNotice | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undone = useRef(false)
  const lastRemoved = useRef<CollectionEntry | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const refresh = useCallback(() => { void qc.invalidateQueries({ queryKey: key }) }, [key, qc])

  /**
   * Remove, with a real 6s undo at EVERY stage.
   *
   * A `found` entry has no application row, so removal is a match-card dismissal;
   * a claimed one is a saved-job dismissal. Two calls, ONE meaning and one undo
   * window — the surface used to make the found one permanent and unundoable
   * while labelling both "Remove from Collections".
   */
  const remove = useCallback((entry: CollectionEntry) => {
    if (timer.current) clearTimeout(timer.current)
    undone.current = false
    lastRemoved.current = entry
    qc.setQueryData<CollectionResponse>(key, (c) =>
      c ? { ...c, entries: c.entries.filter((e) => e.job_id !== entry.job_id) } : c,
    )
    setNotice({ jobId: entry.job_id, kind: "undo" })
    timer.current = setTimeout(() => {
      setNotice(null)
      if (undone.current) return
      const call = entry.stage === "found"
        ? jobsApi.dismissMatchCard(token, entry.job_id)
        : jobsApi.removeTrackerJob(token, entry.job_id)
      void call.catch(() => setNotice({ jobId: entry.job_id, kind: "error" })).finally(refresh)
    }, UNDO_WINDOW_MS)
  }, [key, qc, refresh, token])

  // Undo INSIDE the window never reaches the server — the write is deferred, so
  // there is nothing to reverse and no window where the row is gone for real.
  const undo = useCallback(() => {
    undone.current = true
    if (timer.current) clearTimeout(timer.current)
    setNotice(null)
    const entry = lastRemoved.current
    if (!entry) return
    qc.setQueryData<CollectionResponse>(key, (c) =>
      c && !c.entries.some((e) => e.job_id === entry.job_id)
        ? { ...c, entries: [entry, ...c.entries] }
        : c,
    )
    refresh()
  }, [key, qc, refresh])

  const saveNote = useCallback((jobId: string, note: string) => {
    qc.setQueryData<CollectionResponse>(key, (c) => patchEntry(c, jobId, { notes: note }))
    void jobsApi.updateApplication(token, jobId, { status: "saved", notes: note }).then(refresh)
  }, [key, qc, refresh, token])

  /**
   * The answer to "did you submit?". A yes writes `applied` — the user's own
   * claim, which is the only thing that may advance the stage. A no leaves the
   * entry exactly where it is and simply stops the asking.
   */
  const answerPending = useCallback((jobId: string, submitted: boolean) => {
    qc.setQueryData<CollectionResponse>(key, (c) =>
      patchEntry(c, jobId, submitted ? { stage: "applied", status: "applied", pending_apply: false } : { pending_apply: false }),
    )
    if (!submitted) return
    void jobsApi.updateApplication(token, jobId, { status: "applied" }).then(refresh)
  }, [key, qc, refresh, token])

  return {
    saveNote,
    remove,
    answerPending,
    undo,
    notice,
    clearNotice: () => setNotice(null),
  }
}
