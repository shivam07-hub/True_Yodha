import type { QueryClient } from "@tanstack/react-query"
import type { AgentPicksResponse, JobFeedResponse } from "@/lib/api"

/** Shared with every Agent Picks surface so skip/save from Jobs or Collections
 *  hit the same cache entry. */
export function agentPicksQueryKey(token: string) {
  return ["agentPicks", token] as const
}

/** Drop a job from a cached list. The list is finite, so this is one array — it
 *  used to walk every page of an infinite feed and decrement a total that was
 *  itself the size of a 500-row sample. */
export function removeJobFromList(
  data: JobFeedResponse | undefined,
  jobId: string,
): JobFeedResponse | undefined {
  if (!data) return data
  return { ...data, jobs: data.jobs.filter(j => j.job_id !== jobId) }
}

export function dropJobFromAgentPicks(qc: QueryClient, token: string, jobId: string) {
  qc.setQueryData<AgentPicksResponse>(agentPicksQueryKey(token), prev => {
    if (!prev) return prev
    const picks = prev.picks.filter(p => p.job_id !== jobId)
    if (picks.length === prev.picks.length) return prev
    return { ...prev, picks, total: picks.length }
  })
}

export function dropJobFromJobFeeds(qc: QueryClient, jobId: string) {
  qc.setQueriesData<JobFeedResponse>({ queryKey: ["jobFeed"] }, prev =>
    removeJobFromList(prev, jobId),
  )
}
