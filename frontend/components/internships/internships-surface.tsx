"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { FeedCard } from "@/components/jobs/feed-card"
import { feedDataFromFeedItem } from "@/lib/jobs/card-view"
import { applyLinkAttrs, resolveApplyTarget } from "@/lib/jobs/apply-transport"
import { useAuth } from "@/lib/hooks/use-auth"
import "./internships.css"

export function InternshipsSurface() {
  const { token } = useAuth()
  const { data, isLoading, isError } = useQuery({
    queryKey: dataKeys.internships("all"),
    queryFn: () => jobs.internships({ token: token ?? undefined }),
    staleTime: 60_000,
  })
  const listings = data?.jobs ?? []

  return (
    <main className="intern-page">
      <p className="intern-kicker">Paid internships</p>
      <h1 className="intern-title">Internships</h1>
      <p className="intern-lead">
        Hosted listings use Apply here. Career-page listings open the company portal.
      </p>
      <div className="intern-actions">
        <Link href="/internships/post" className="intern-submit" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", padding: "0 16px" }}>
          Post a paid internship
        </Link>
        <Link href="/market?lane=internships" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 14px", border: "1px solid var(--tm-border-soft)", color: "var(--tm-text)", textDecoration: "none" }}>
          Open in Jobs
        </Link>
      </div>
      {isLoading ? <p className="intern-empty">Loading internships</p> : null}
      {isError ? <p className="intern-error">Could not load internships</p> : null}
      {!isLoading && listings.length === 0 ? (
        <p className="intern-empty">No live internships yet. Post one, or keep the Jobs lane for MNC roles.</p>
      ) : (
        <div className="intern-list">
          {listings.map((job) => {
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
                data={feedDataFromFeedItem(job, { hasCv: false })}
                variant="row"
                actions={attrs.href && target.actionLabel ? (
                  <a
                    {...attrs}
                    className="intern-submit"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "0 14px",
                      textDecoration: "none",
                      ...(target.kind === "hosted"
                        ? {}
                        : { background: "transparent", color: "var(--tm-text)", borderColor: "var(--tm-border-soft)" }),
                    }}
                  >
                    {target.actionLabel}{target.kind === "direct" ? " ↗" : ""}
                  </a>
                ) : null}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}
