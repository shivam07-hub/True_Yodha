"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs, type JobFeedItem } from "@/lib/api"
import { FeedCard } from "@/components/jobs/feed-card"
import { feedDataFromFeedItem } from "@/lib/jobs/card-view"
import { applyLinkAttrs, resolveApplyTarget } from "@/lib/jobs/apply-transport"
import "./internships.css"

export const HOSTED_FOR_YOU_KEY = ["internships-for-you"] as const

/**
 * Every live paid internship hosted on Myro, the ones he fits first
 * (private.hosted_fit — the rule behind the recruiter's "N people on Myro
 * match"), and how many are live in all. One read, shared by the band and the
 * lane chips. A card leaves once he applies or skips it.
 */
export function useHostedForYou(token: string | null | undefined) {
  const q = useQuery({
    queryKey: HOSTED_FOR_YOU_KEY,
    queryFn: () => jobs.internshipsForYou(token as string),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  })
  return { jobs: q.data?.jobs ?? [], total: q.data?.total ?? 0 }
}

/**
 * The band above his judged Jobs list. Not rows in it: that list is judge-only
 * (`/jobs/feed`, score ≥ 3.5), and these are posts on Myro, not judged. Where
 * his attention already is, without bending what the list means.
 */
export function HostedBand({ token }: { token: string }) {
  const { jobs: shown } = useHostedForYou(token)
  const qc = useQueryClient()
  if (shown.length === 0) return null

  const skip = (job: JobFeedItem) => {
    qc.setQueryData<{ total: number; jobs: JobFeedItem[] }>(HOSTED_FOR_YOU_KEY, (prev) =>
      prev ? { ...prev, jobs: prev.jobs.filter((j) => j.job_id !== job.job_id) } : prev,
    )
    void jobs.skipJob(token, job.job_id).catch(() => qc.invalidateQueries({ queryKey: HOSTED_FOR_YOU_KEY }))
  }

  return (
    <section className="intern-band" aria-label="Paid internships">
      <p className="intern-kicker">Paid internships</p>
      {shown.map((job) => {
        const target = resolveApplyTarget({
          job_id: job.job_id,
          source_url: job.source_url,
          company: job.company_name,
          listing_venue: job.listing_venue,
        })
        const attrs = applyLinkAttrs(target)
        return (
          <FeedCard
            key={job.job_id}
            data={feedDataFromFeedItem(job, { hasCv: true })}
            variant="row"
            actions={
              <>
                {attrs.href && target.actionLabel ? (
                  <a {...attrs} className="intern-submit intern-band-apply">{target.actionLabel}</a>
                ) : null}
                <button type="button" className="intern-secondary" onClick={() => skip(job)}>
                  Not for me
                </button>
              </>
            }
          />
        )
      })}
    </section>
  )
}
