/**
 * useMasterAutosave — living-master autosave for the Main CV (PR-3).
 *
 * Contract (grill Q5: save ≠ score):
 *   - Edits update a local draft instantly + persist to sessionStorage (refresh
 *     recovery) + schedule a debounced PUT /cv/master (cheap mutate, no XP/LLM).
 *   - status: idle → saving → saved (or error, draft retained for retry).
 *   - On save the server async re-tags; recomputePending drives the score-ring
 *     shimmer until the SE17 poll sees recompute_finished_at, then scores +
 *     skills queries invalidate.
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { cv } from "@/lib/api"
import type { CVStructured, CVVersion } from "@/lib/api"
import { dataKeys, invalidateScoreData, invalidateScoreMapData } from "@/lib/domain-data"
import { hasCvContent, latestBaseline } from "@/lib/cv/durable-answer"
import {
  cvStructuredEqual,
  masterDraftKey,
  parsePersistedDraft,
  pickInitialDraft,
  type SaveStatus,
} from "@/lib/cv-autosave"

const DEBOUNCE_MS = 1_200
const RECOMPUTE_POLL_MS = 3_000
const RECOMPUTE_CAP_MS = 30_000

interface Args {
  token: string | null
  enabled: boolean
  /** Stable per-user key for the recovery draft (e.g. ninja_name or user id). */
  userKey: string
  /** Already-loaded paper JSON. Display owns this; the hook must not wait on a second GET. */
  seed?: CVStructured | null
}

export interface MasterAutosaveState {
  draft: CVStructured | null
  ready: boolean
  status: SaveStatus
  recomputePending: boolean
  update: (next: CVStructured) => void
  saveNow: () => void
}

export function useMasterAutosave({ token, enabled, userKey, seed = null }: Args): MasterAutosaveState {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<CVStructured | null>(null)
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [recomputePending, setRecomputePending] = useState(false)

  const versionsQuery = useQuery({
    queryKey: dataKeys.cvVersions(null),
    queryFn: () => cv.versions.list(token!, null),
    enabled: enabled && !!token,
    retry: false,
    staleTime: 10 * 1000,
  })
  const baseline = latestBaseline(versionsQuery.data?.versions)
  const stored = baseline?.cv_structured
  const serverStructured = hasCvContent(stored) ? stored : (hasCvContent(seed) ? seed : null)

  const draftKey = masterDraftKey(userKey)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<CVStructured | null>(null)
  const serverRef = useRef<CVStructured | null>(null)

  // Hydrate the draft once the server copy arrives, recovering a divergent
  // persisted draft (user reloaded mid-edit before the save landed).
  useEffect(() => {
    if (draft != null || !serverStructured) return
    const persisted = typeof window !== "undefined"
      ? parsePersistedDraft(window.sessionStorage.getItem(draftKey))
      : null
    const initial = pickInitialDraft(serverStructured, persisted)
    serverRef.current = serverStructured
    latestRef.current = initial
    setDraft(initial)
    if (persisted && initial && !cvStructuredEqual(serverStructured, initial)) {
      setStatus("idle") // recovered unsaved edits — let the user re-trigger a save
    }
  }, [serverStructured, draft, draftKey])

  const pollRecompute = useCallback((baselineId: number) => {
    if (!token) return
    setRecomputePending(true)
    const startedAt = Date.now()
    const tick = async () => {
      try {
        const res = await cv.recomputeStatus(token, baselineId)
        if (res.recompute_finished_at) {
          setRecomputePending(false)
          invalidateScoreMapData(queryClient)
          queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
          return
        }
      } catch {
        /* transient — keep polling until the cap */
      }
      if (Date.now() - startedAt < RECOMPUTE_CAP_MS) {
        setTimeout(tick, RECOMPUTE_POLL_MS)
      } else {
        // Cap hit — stop the shimmer, refresh best-effort so the score isn't stale.
        setRecomputePending(false)
        invalidateScoreData(queryClient)
      }
    }
    setTimeout(tick, RECOMPUTE_POLL_MS)
  }, [token, queryClient])

  const flush = useCallback(async () => {
    const next = latestRef.current
    if (!token || !next) return
    if (cvStructuredEqual(serverRef.current, next)) {
      setStatus("saved")
      return
    }
    setStatus("saving")
    try {
      const res = await cv.saveMaster(token, next)
      serverRef.current = next
      try { window.sessionStorage.removeItem(draftKey) } catch { /* private mode */ }
      setStatus("saved")
      pollRecompute(res.baseline_id)
    } catch {
      setStatus("error") // tab-scoped draft retained → recoverable retry
    }
  }, [token, draftKey, pollRecompute])

  const update = useCallback((next: CVStructured) => {
    latestRef.current = next
    setDraft(next)
    // The Hub and export preview subscribe to the same structured query. Keep
    // them in lockstep with the local draft instead of showing stale content
    // until the async re-tag finishes.
    queryClient.setQueryData<{ versions: CVVersion[] }>(dataKeys.cvVersions(null), (old) => {
      if (!old) return old
      const row = latestBaseline(old.versions)
      if (!row) return old
      return {
        versions: old.versions.map((version) => (
          version.id === row.id ? { ...version, cv_structured: next } : version
        )),
      }
    })
    try { window.sessionStorage.setItem(draftKey, JSON.stringify(next)) } catch { /* private mode */ }
    setStatus("saving")
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void flush() }, DEBOUNCE_MS)
  }, [draftKey, flush, queryClient])

  const saveNow = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    void flush()
  }, [flush])

  // Persist during a refresh so a debounce in-flight isn't lost. Tab-scoped
  // storage is cleared when the browsing session ends.
  useEffect(() => {
    const onHide = () => {
      const next = latestRef.current
      if (next) {
        try { window.sessionStorage.setItem(draftKey, JSON.stringify(next)) } catch { /* ignore */ }
      }
    }
    window.addEventListener("beforeunload", onHide)
    return () => {
      window.removeEventListener("beforeunload", onHide)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draftKey])

  return {
    draft,
    ready: draft != null,
    status,
    recomputePending,
    update,
    saveNow,
  }
}
