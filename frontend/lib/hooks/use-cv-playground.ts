/**
 * useCVPlayground — owns the CV Builder playground state machine for one Company CV Thread.
 *
 * Deepening of the inline state previously scattered across app/cv/page.tsx (parked Q #10).
 * See CONTEXT.md ("Company CV Thread") for the read model and the hydration rules below.
 *
 * State invariants:
 *   - Hydration of hiddenItems happens on initial load OR after an explicit user pick.
 *     Background refetches never overwrite the user's playground state. This kills the
 *     race that made saved versions appear to vanish during the post-save refetch.
 *   - selectedVersionId points to the row the user is editing AGAINST. After a save/polish/edit,
 *     it advances to the new child. After a manual pick, it tracks the picked id.
 *   - isDirty compares the current hiddenItems against the selected version's hidden_items.
 *     A freshly-saved version has matching items → isDirty=false → CVCommitPane renders saved.
 */
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { cv } from "@/lib/api"
import type { CVStructured, CVVersion } from "@/lib/api"
import { renderDeterministic } from "@/lib/cv-compose"
import { dataKeys } from "@/lib/domain-data"

interface UseCVPlaygroundArgs {
  token: string | null
  jobId: string | null
  enabled: boolean
}

export interface CVPlaygroundState {
  // Queries
  structuredQuery: ReturnType<typeof useQuery<CVStructured>>
  versionsLoading: boolean

  // Derived collections
  allVersions: CVVersion[]
  baselines: CVVersion[]
  currentBaseline: CVVersion | null
  threadVersions: CVVersion[]          // baselines + Company CV Thread (one display order)

  // Selection
  selectedVersionId: number | null
  selectedVersion: CVVersion | null
  selectVersion: (id: number) => void  // explicit user pick — hydrates hiddenItems

  // Editing
  hiddenItems: Set<string>
  toggleItem: (iid: string) => void
  livePreviewText: string
  isDirty: boolean
  canSave: boolean
  lastWrite: CVWriteReceipt | null
  clearLastWrite: () => void

  // Option C auto-save: hide/show edits persist as the user works (no Save button).
  autosaving: boolean
  autosaved: boolean
  /** Persist any pending (debounced) hide/show toggles NOW. Await before
   *  navigating to a surface that re-hydrates from the saved version
   *  (/cv/export) — otherwise unmount cancels the debounce and the toggles
   *  silently die. Rejects on save failure (error is surfaced via `error`). */
  flushHidden: () => Promise<void>

  // Mutations
  saveVersion: ReturnType<typeof useMutation<CVVersion, Error, void>>
  polishVersion: ReturnType<typeof useMutation<CVVersion, Error, number>>
  editVersion: ReturnType<typeof useMutation<
    CVVersion,
    Error,
    { versionId: number; edits: Record<string, string> }
  >>

  // Errors surfaced for the page to render
  error: string | null
}

export type CVWriteAction = "save" | "polish" | "edit"

export interface CVWriteReceipt {
  action: CVWriteAction
  versionId: number
  userVersionNumber: number
  createdAt: string
  atMs: number
}

function chooseDefault(thread: CVVersion[], baseline: CVVersion | null): CVVersion | null {
  return thread[0] ?? baseline ?? null
}

export function useCVPlayground({ token, jobId, enabled }: UseCVPlaygroundArgs): CVPlaygroundState {
  const queryClient = useQueryClient()
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [lastWrite, setLastWrite] = useState<CVWriteReceipt | null>(null)

  // Tracks the last id we hydrated FROM. If a refetch arrives with the same selection,
  // we skip the redundant setHiddenItems write — preserves user toggles in-flight.
  const lastHydratedRef = useRef<number | null>(null)
  // Serialized hidden_items last persisted to the server. Guards the autosave
  // effect from re-firing on a state that's already saved (incl. post-save refetch).
  const lastSavedRef = useRef<string>("")
  const [autosaved, setAutosaved] = useState(false)

  const serializeHidden = (s: Iterable<string>) => Array.from(s).sort().join(",")

  const versionsQuery = useQuery({
    queryKey: dataKeys.cvVersions(jobId),
    queryFn: () => cv.versions.list(token!, jobId),
    enabled: enabled && !!token,
    staleTime: 30 * 1000,
  })

  const allVersions = useMemo(
    () => versionsQuery.data?.versions ?? [],
    [versionsQuery.data],
  )
  const baselines = useMemo(
    () => allVersions.filter(v => v.kind === "baseline_upload"),
    [allVersions],
  )
  const currentBaseline = useMemo<CVVersion | null>(
    () => baselines.reduce<CVVersion | null>(
      (best, v) => (best == null || v.user_version_number > best.user_version_number ? v : best),
      null,
    ),
    [baselines],
  )
  // The backend already scopes derivatives to the Company CV Thread for this jobId
  // (CONTEXT.md → Company CV Thread). No per-job filter here — that filter was the bug.
  const companyVersions = useMemo(
    () => allVersions.filter(v => v.kind !== "baseline_upload"),
    [allVersions],
  )
  const threadVersions = useMemo(
    () => currentBaseline ? [currentBaseline, ...companyVersions] : companyVersions,
    [companyVersions, currentBaseline],
  )

  const hasBaseline = baselines.length > 0
  const structuredQuery = useQuery({
    queryKey: dataKeys.cvStructured(),
    queryFn: () => cv.structured(token!),
    enabled: enabled && !!token && hasBaseline,
    retry: 1,
    staleTime: 10 * 60 * 1000,
  })

  // Hydration rule (see file header):
  //   - On initial arrival of data, pick a default and hydrate hiddenItems from it.
  //   - On user explicit pick, hydrate from the picked version.
  //   - On any other refetch, leave state alone (kills the post-save race).
  useEffect(() => {
    if (selectedVersionId != null) return
    const defaultVersion = chooseDefault(companyVersions, currentBaseline)
    if (!defaultVersion) return
    setSelectedVersionId(defaultVersion.id)
    setHiddenItems(new Set(defaultVersion.hidden_items))
    lastHydratedRef.current = defaultVersion.id
    lastSavedRef.current = serializeHidden(defaultVersion.hidden_items)
  }, [companyVersions, currentBaseline, selectedVersionId])

  const selectVersion = useCallback((id: number) => {
    const target = threadVersions.find(v => v.id === id)
    if (!target) return
    setSelectedVersionId(id)
    setHiddenItems(new Set(target.hidden_items))
    lastHydratedRef.current = id
    lastSavedRef.current = serializeHidden(target.hidden_items)
  }, [threadVersions])

  const toggleItem = useCallback((iid: string) => {
    setHiddenItems(prev => {
      const next = new Set(prev)
      if (next.has(iid)) next.delete(iid)
      else next.add(iid)
      return next
    })
  }, [])

  const selectedVersion = useMemo<CVVersion | null>(() => {
    if (selectedVersionId == null) return chooseDefault(companyVersions, currentBaseline)
    return threadVersions.find(v => v.id === selectedVersionId) ?? null
  }, [companyVersions, currentBaseline, selectedVersionId, threadVersions])

  const livePreviewText = useMemo(() => {
    if (!structuredQuery.data) return ""
    return renderDeterministic(structuredQuery.data, hiddenItems)
  }, [structuredQuery.data, hiddenItems])

  const isDirty = useMemo(() => {
    if (!selectedVersion) return companyVersions.length === 0
    if (selectedVersion.kind === "baseline_upload" && companyVersions.length === 0) return true
    const userHidden = Array.from(hiddenItems).sort().join(",")
    const versionHidden = [...selectedVersion.hidden_items].sort().join(",")
    return userHidden !== versionHidden
  }, [companyVersions.length, hiddenItems, selectedVersion])

  const canSave = isDirty || companyVersions.length === 0

  const onMutationSuccess = useCallback((action: CVWriteAction, v: CVVersion) => {
    // Patch the cache with the new row BEFORE the invalidate refetch lands, so
    // a surface that mounts right after a write (e.g. /cv/export after a
    // flushed save) hydrates from the fresh version, not the stale list.
    queryClient.setQueryData<{ versions: CVVersion[] }>(
      dataKeys.cvVersions(jobId),
      (old) => old
        ? { versions: [v, ...old.versions.filter(row => row.id !== v.id)] }
        : old,
    )
    queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
    setSelectedVersionId(v.id)
    setHiddenItems(new Set(v.hidden_items))
    lastHydratedRef.current = v.id
    lastSavedRef.current = serializeHidden(v.hidden_items)
    setLastWrite({
      action,
      versionId: v.id,
      userVersionNumber: v.user_version_number,
      createdAt: v.created_at,
      atMs: Date.now(),
    })
    setError(null)  // clear any prior mutation error now that we have a successful write
  }, [jobId, queryClient])

  const saveVersion = useMutation({
    mutationFn: () => cv.versions.create(token!, jobId!, Array.from(hiddenItems)),
    onSuccess: (v) => onMutationSuccess("save", v),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save version."),
  })

  const polishVersion = useMutation({
    mutationFn: (versionId: number) => cv.versions.polish(token!, versionId),
    onSuccess: (v) => onMutationSuccess("polish", v),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not polish version."),
  })

  const editVersion = useMutation({
    mutationFn: ({ versionId, edits }: { versionId: number; edits: Record<string, string> }) =>
      cv.versions.edit(token!, versionId, edits),
    onSuccess: (v) => onMutationSuccess("edit", v),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save edits."),
  })

  // Auto-save the projection in place on the job's deterministic working draft.
  // Patches the cached row on success so selectedVersion.hidden_items matches the
  // user's state → isDirty settles false without a refetch flicker.
  const autosave = useMutation({
    mutationFn: ({ versionId, hidden }: { versionId: number; hidden: string[] }) =>
      cv.versions.updateHiddenItems(token!, versionId, hidden),
    onSuccess: (v) => {
      queryClient.setQueryData<{ versions: CVVersion[] }>(
        dataKeys.cvVersions(jobId),
        (old) => old
          ? { versions: old.versions.map(row => (row.id === v.id ? v : row)) }
          : old,
      )
      lastSavedRef.current = serializeHidden(v.hidden_items)
      setAutosaved(true)
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not auto-save."),
  })

  // Debounced auto-save: 1.2s after the user stops toggling, persist the
  // projection. The first edit on a job with no working draft creates one
  // (saveVersion); subsequent edits patch it in place (no snapshot pile-up).
  // The timer lives in a ref so flushHidden can cancel it and persist NOW.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!enabled || !token || !jobId) return
    const serialized = serializeHidden(hiddenItems)
    if (serialized === lastSavedRef.current) return
    setAutosaved(false)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      const sel = selectedVersion
      if (sel && sel.kind === "deterministic" && sel.job_id) {
        autosave.mutate({ versionId: sel.id, hidden: Array.from(hiddenItems) })
      } else {
        saveVersion.mutate()
      }
    }, 1200)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenItems, enabled, token, jobId, selectedVersion])

  // Persist pending toggles immediately (cancel the debounce, run the same
  // save path, await it). Callers navigating to a re-hydrating surface MUST
  // await this — otherwise the export renders the last SAVED projection and
  // deselected lines resurrect in the artifact (ADR-0020: render what the
  // user sees).
  const flushHidden = useCallback(async (): Promise<void> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (!enabled || !token || !jobId) return
    if (serializeHidden(hiddenItems) === lastSavedRef.current) return
    const sel = selectedVersion
    if (sel && sel.kind === "deterministic" && sel.job_id) {
      await autosave.mutateAsync({ versionId: sel.id, hidden: Array.from(hiddenItems) })
    } else {
      await saveVersion.mutateAsync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, jobId, hiddenItems, selectedVersion])

  // Unmount safety net: any exit (back to library, top-nav away, tab route
  // change) with an un-flushed debounce would otherwise drop the user's
  // toggles on the floor. Fire-and-forget the same persist with raw API
  // calls — the component (and its mutation observers) is gone by then.
  const unmountRef = useRef({ enabled, token, jobId, hiddenItems, selectedVersion })
  unmountRef.current = { enabled, token, jobId, hiddenItems, selectedVersion }
  useEffect(() => () => {
    const { enabled: en, token: tk, jobId: jid, hiddenItems: hid, selectedVersion: sel } = unmountRef.current
    if (!en || !tk || !jid) return
    if (serializeHidden(hid) === lastSavedRef.current) return
    const hidden = Array.from(hid)
    const persist = sel && sel.kind === "deterministic" && sel.job_id
      ? cv.versions.updateHiddenItems(tk, sel.id, hidden)
      : cv.versions.create(tk, jid, hidden)
    persist
      .then(() => queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jid) }))
      // Degradation: the user already left this surface — nothing to render an
      // error into. The projection stays at its last saved state; log for triage.
      .catch(() => console.warn("metric cv.hidden_flush_unmount_failed"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearLastWrite = useCallback(() => setLastWrite(null), [])

  return {
    structuredQuery,
    versionsLoading: versionsQuery.isLoading,
    allVersions,
    baselines,
    currentBaseline,
    threadVersions,
    selectedVersionId,
    selectedVersion,
    selectVersion,
    hiddenItems,
    toggleItem,
    livePreviewText,
    isDirty,
    canSave,
    lastWrite,
    clearLastWrite,
    autosaving: autosave.isPending || saveVersion.isPending,
    autosaved,
    flushHidden,
    saveVersion,
    polishVersion,
    editVersion,
    error,
  }
}
