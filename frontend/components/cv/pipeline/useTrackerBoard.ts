"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs, APPLICATION_STAGES, APPLICATION_OUTCOMES } from "@/lib/api"
import type { ApplicationResponse, ApplicationStatus, StaleApplication } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

export type StageKey = "saved" | "applied" | "interviewing"
export type OutcomeKey = "ghosted" | "rejected" | "offer"

export const STAGE_LABEL: Record<StageKey, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
}

export const OUTCOME_LABEL: Record<OutcomeKey, string> = {
  ghosted: "Ghosted",
  rejected: "Rejected",
  offer: "Offer",
}

export const STAGE_ROMAN: Record<StageKey, string> = {
  saved: "I",
  applied: "II",
  interviewing: "III",
}

export interface UpdateStatusInput {
  jobId: string
  status: ApplicationStatus
}

export interface UpdateNotesInput {
  jobId: string
  notes: string
}

export function useTrackerBoard() {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  const applicationsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobs.applications(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  const staleQuery = useQuery({
    queryKey: dataKeys.staleApplications(),
    queryFn: () => jobs.staleApplications(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  const updateStatus = useMutation({
    mutationFn: ({ jobId, status }: UpdateStatusInput) =>
      jobs.updateApplication(token!, jobId, { status }),
    // Optimistic: the card lands in its new column on drop, not after the
    // round-trip (mirror of useApplicationStatus — the board keeps the
    // mutation-object interface its drag handler passes per-call callbacks to;
    // per-call onSuccess/onError still fire alongside these).
    onMutate: async ({ jobId, status }: UpdateStatusInput) => {
      await queryClient.cancelQueries({ queryKey: dataKeys.applications() })
      const prev = queryClient.getQueryData<ApplicationResponse[]>(dataKeys.applications())
      queryClient.setQueryData<ApplicationResponse[] | undefined>(dataKeys.applications(), (old) =>
        (old ?? []).map((a) => (a.job_id === jobId ? { ...a, status } : a)),
      )
      return { prev }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(dataKeys.applications(), ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      queryClient.invalidateQueries({ queryKey: dataKeys.staleApplications() })
    },
  })

  const updateNotes = useMutation({
    mutationFn: ({ jobId, notes }: UpdateNotesInput) =>
      jobs.updateApplication(token!, jobId, {
        status: applicationsQuery.data?.find(a => a.job_id === jobId)?.status ?? "saved",
        notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
    },
  })

  const dismissStale = useMutation({
    mutationFn: (jobId: string) => jobs.dismissStale(token!, jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.staleApplications() })
    },
  })

  const deleteApplication = useMutation({
    mutationFn: (jobId: string) => jobs.removeTrackerJob(token!, jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      queryClient.invalidateQueries({ queryKey: dataKeys.staleApplications() })
    },
  })

  return {
    applications: applicationsQuery.data ?? [],
    applicationsLoading: applicationsQuery.isLoading,
    staleApplications: staleQuery.data ?? [],
    updateStatus,
    updateNotes,
    dismissStale,
    deleteApplication,
  }
}

export function daysBetween(iso: string | null | undefined): number {
  if (!iso) return 0
  const then = new Date(iso).getTime()
  const now = Date.now()
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
}

export function partitionByStage(
  apps: ApplicationResponse[],
): Record<StageKey, ApplicationResponse[]> {
  const byStage: Record<StageKey, ApplicationResponse[]> = {
    saved: [], applied: [], interviewing: [],
  }
  for (const a of apps) {
    if ((APPLICATION_STAGES as readonly string[]).includes(a.status)) {
      byStage[a.status as StageKey].push(a)
    }
  }
  // Active = oldest at top (most stuck surfaces). Q12.
  for (const k of Object.keys(byStage) as StageKey[]) {
    byStage[k].sort((a, b) => {
      const aT = new Date(a.last_stage_changed_at ?? a.created_at).getTime()
      const bT = new Date(b.last_stage_changed_at ?? b.created_at).getTime()
      return aT - bT
    })
  }
  return byStage
}

export function partitionVerdicts(apps: ApplicationResponse[]): ApplicationResponse[] {
  return apps
    .filter(a => (APPLICATION_OUTCOMES as readonly string[]).includes(a.status))
    .sort((a, b) => {
      // Verdicts = newest first. Q12.
      const aT = new Date(a.last_stage_changed_at ?? a.closed_at ?? a.created_at).getTime()
      const bT = new Date(b.last_stage_changed_at ?? b.closed_at ?? b.created_at).getTime()
      return bT - aT
    })
}

export function isStuck(stale: StaleApplication[], jobId: string): StaleApplication | null {
  return stale.find(s => s.job_id === jobId) ?? null
}
