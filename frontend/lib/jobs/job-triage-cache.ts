import type { QueryClient, InfiniteData } from "@tanstack/react-query"
import type { AgentPicksResponse, JobFeedResponse } from "@/lib/api"

/** Shared with every Agent Picks surface so skip/save from Jobs or Collections
 *  hit the same cache entry. */
export function agentPicksQueryKey(token: string) {
  return ["agentPicks", token] as const
}

/** Drop a job from every page of a cached infinite feed + decrement the draining
 *  queue count on the first page. */
export function removeJobFromPages(
  data: InfiniteData<JobFeedResponse> | undefined,
  jobId: string,
): InfiniteData<JobFeedResponse> | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((p, i) => ({
      ...p,
      jobs: p.jobs.filter(j => j.job_id !== jobId),
      available_total: i === 0 ? Math.max(0, p.available_total - 1) : p.available_total,
    })),
  }
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
  qc.setQueriesData<InfiniteData<JobFeedResponse>>({ queryKey: ["jobFeed"] }, prev =>
    removeJobFromPages(prev, jobId),
  )
}
