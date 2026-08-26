"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type ApplicationResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

/**
 * The ONE priority toggle, shared by desktop Collections and the mobile
 * surfaces. It used to live inline in collections-desktop, which is how mobile
 * ended up with no priority control at all and a heart that meant "remove"
 * instead — the same glyph, the opposite outcome, on two platforms.
 *
 * Optimistic by contract: the heart fills on tap and rolls back only if the
 * write fails. A durable intent the user just expressed must never wait on a
 * round trip to appear — waiting is what makes a tap feel unheard.
 */

/** Optimistic pass — the tap is believed until the server disagrees. */
export function applyPriorityOptimistic(
  applications: ApplicationResponse[] | undefined,
  jobId: string,
  prioritized: boolean,
): ApplicationResponse[] | undefined {
  return applications?.map((application) =>
    application.job_id === jobId ? { ...application, is_priority: prioritized } : application,
  )
}

/** Server truth — replaces the optimistic row, or appends one we did not hold. */
export function mergePriorityResult(
  applications: ApplicationResponse[] | undefined,
  updated: ApplicationResponse,
): ApplicationResponse[] {
  const current = applications ?? []
  return current.some((application) => application.job_id === updated.job_id)
    ? current.map((application) => (application.job_id === updated.job_id ? updated : application))
    : [...current, updated]
}

export function useJobPriority(token: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ jobId, prioritized }: { jobId: string; prioritized: boolean }) =>
      jobsApi.setJobPriority(token, jobId, prioritized),
    onMutate: async ({ jobId, prioritized }) => {
      const key = dataKeys.applications()
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<ApplicationResponse[]>(key)
      qc.setQueryData<ApplicationResponse[]>(key, (current) =>
        applyPriorityOptimistic(current, jobId, prioritized) ?? current,
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) qc.setQueryData(dataKeys.applications(), context.previous)
    },
    onSuccess: (updated) => {
      qc.setQueryData<ApplicationResponse[]>(dataKeys.applications(), (current) =>
        mergePriorityResult(current, updated),
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: dataKeys.applications() }),
  })
}
