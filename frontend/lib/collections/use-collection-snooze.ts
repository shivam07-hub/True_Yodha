"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type ApplicationResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

/**
 * The ONE snooze, shared by desktop Collections and mobile.
 *
 * Snoozing writes `collection_snoozed_until`, which no list filters on — it
 * only quiets the attention badge. Both platforms fired it and invalidated,
 * so nothing on screen moved until the refetch landed and the button read as
 * dead. The optimistic write moves the badge on tap instead.
 */

export const SNOOZE_DAYS = 3

/** Optimistic pass — the row is quiet from this moment, not from the response. */
export function applySnoozeOptimistic(
  applications: ApplicationResponse[] | undefined,
  jobId: string,
  until: string,
): ApplicationResponse[] | undefined {
  return applications?.map((application) =>
    application.job_id === jobId ? { ...application, collection_snoozed_until: until } : application,
  )
}

/** `days` from `now` as an ISO instant — the value the server will also write. */
export function snoozeUntil(now: Date, days = SNOOZE_DAYS): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function useCollectionSnooze(token: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (jobId: string) => jobsApi.snoozeCollection(token, jobId, SNOOZE_DAYS),
    onMutate: async (jobId) => {
      const key = dataKeys.applications()
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<ApplicationResponse[]>(key)
      qc.setQueryData<ApplicationResponse[]>(key, (current) =>
        applySnoozeOptimistic(current, jobId, snoozeUntil(new Date())) ?? current,
      )
      return { previous }
    },
    onError: (_error, _jobId, context) => {
      if (context?.previous) qc.setQueryData(dataKeys.applications(), context.previous)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: dataKeys.applications() })
      void qc.invalidateQueries({ queryKey: dataKeys.notificationsUnread() })
    },
  })
}
