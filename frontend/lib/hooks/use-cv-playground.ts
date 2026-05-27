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
    retry: false,
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
  }, [companyVersions, currentBaseline, selectedVersionId])

  const selectVersion = useCallback((id: number) => {
    const target = threadVersions.find(v => v.id === id)
    if (!target) return
    setSelectedVersionId(id)
    setHiddenItems(new Set(target.hidden_items))
    lastHydratedRef.current = id
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
    queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(jobId) })
    setSelectedVersionId(v.id)
    setHiddenItems(new Set(v.hidden_items))
    lastHydratedRef.current = v.id
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
    saveVersion,
    polishVersion,
    editVersion,
    error,
  }
}
