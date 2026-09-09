"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { jobs, APPLICATION_OUTCOMES } from "@/lib/api"
import type { ApplicationResponse, ApplicationStatus } from "@/lib/api"
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

export interface UpdateStatusInput {
  jobId: string
  status: ApplicationStatus
}

export interface UpdateNotesInput {
  jobId: string
  notes: string
  // The caller already knows the row it is editing. The status used to be
  // looked up by reading EVERY application on mount, purely to echo it back on
  // a PATCH — a whole network read to answer a question the caller could
  // answer itself.
  status: ApplicationStatus
}

export function useTrackerBoard() {
  const { token } = useAuth()
  const queryClient = useQueryClient()

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
    },
  })

  const updateNotes = useMutation({
    mutationFn: ({ jobId, notes, status }: UpdateNotesInput) =>
      jobs.updateApplication(token!, jobId, { status, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
    },
  })

  return { updateStatus, updateNotes }
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
