"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import { ApiError } from "@/lib/api-error"
import { dataKeys } from "@/lib/domain-data"
import { FeedCard } from "@/components/jobs/feed-card"
import { feedDataFromFeedItem } from "@/lib/jobs/card-view"
import { applyLinkAttrs, resolveApplyTarget } from "@/lib/jobs/apply-transport"
import { listingVenueOf } from "@/lib/jobs/card-logistics"
import { useAuth } from "@/lib/hooks/use-auth"
import "./internships.css"

export function InternshipApplyForm({ jobId }: { jobId: string }) {
  const { token } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const listing = useQuery({
    queryKey: ["internship", jobId],
    queryFn: () => jobs.internship(jobId),
  })
  const hosted = listing.data ? listingVenueOf(listing.data.listing_venue) === "myro" : false
  const target = listing.data
    ? resolveApplyTarget({
        job_id: listing.data.job_id,
        source_url: listing.data.source_url,
        company: listing.data.company_name,
        listing_venue: listing.data.listing_venue,
      })
    : null

  async function submit() {
    if (!token) {
      router.push(`/login?next=/internships/${encodeURIComponent(jobId)}/apply`)
      return
    }
    setError(null)
    setPending(true)
    try {
      await jobs.applyInternship(token, jobId)
      setDone(true)
      void queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="intern-page">
      <p className="intern-kicker">{hosted ? "Apply here" : "Internship"}</p>
      <h1 className="intern-title">
        {listing.data?.job_title ?? (listing.isLoading ? "Loading listing" : "Listing not found")}
      </h1>
      {hosted ? null : (
        <p className="intern-lead">This listing applies on the company portal.</p>
      )}
      {listing.data ? (
        <FeedCard data={feedDataFromFeedItem(listing.data, { hasCv: Boolean(token) })} variant="row" />
      ) : listing.isLoading ? (
        <p className="intern-empty">Loading listing</p>
      ) : (
        <p className="intern-error">Listing not found</p>
      )}
      {done ? (
        <p className="intern-lead" style={{ marginTop: 18 }}>
          Filed in <Link href="/collections">Collections</Link>.
        </p>
      ) : hosted ? (
        <div className="intern-actions" style={{ marginTop: 18 }}>
          <button type="button" className="intern-submit" disabled={pending || !listing.data} onClick={() => void submit()}>
            {pending ? "Sending" : "Apply here"}
          </button>
          <Link href="/internships" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: "var(--tm-text-muted)" }}>
            All internships
          </Link>
        </div>
      ) : target?.url && target.actionLabel ? (
        <div className="intern-actions" style={{ marginTop: 18 }}>
          <a
            {...applyLinkAttrs(target)}
            className="intern-submit"
            style={{ display: "inline-flex", alignItems: "center", padding: "0 16px", textDecoration: "none" }}
          >
            {target.actionLabel}{target.kind === "direct" ? " ↗" : ""}
          </a>
          <Link href="/internships" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: "var(--tm-text-muted)" }}>
            All internships
          </Link>
        </div>
      ) : (
        <div className="intern-actions" style={{ marginTop: 18 }}>
          <Link href="/internships" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: "var(--tm-text-muted)" }}>
            All internships
          </Link>
        </div>
      )}
      {error ? <p className="intern-error">{error}</p> : null}
    </main>
  )
}
