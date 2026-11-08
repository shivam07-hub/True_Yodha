"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { cv as cvApi, jobs } from "@/lib/api"
import { cvOfRecordFor } from "@/lib/cv/workspace"
import { formatDate } from "@/lib/format"
import { ApiError } from "@/lib/api-error"
import { dataKeys } from "@/lib/domain-data"
import { FeedCard } from "@/components/jobs/feed-card"
import { feedDataFromFeedItem } from "@/lib/jobs/card-view"
import { applyLinkAttrs, resolveApplyTarget } from "@/lib/jobs/apply-transport"
import { listingVenueOf } from "@/lib/jobs/card-logistics"
import { useAuth } from "@/lib/hooks/use-auth"
import { HOSTED_FOR_YOU_KEY } from "./hosted-band"
import "./internships.css"

export function InternshipApplyForm({ jobId }: { jobId: string }) {
  const { token } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sentAt, setSentAt] = useState<string | null>(null)
  const listing = useQuery({
    queryKey: ["internship", jobId],
    queryFn: () => jobs.internship(jobId),
  })
  const hosted = listing.data ? listingVenueOf(listing.data.listing_venue) === "myro" : false
  const versions = useQuery({
    queryKey: dataKeys.cvVersions(null),
    queryFn: () => cvApi.versions.list(token as string, null),
    enabled: Boolean(token) && hosted,
    staleTime: 60_000,
  })
  // The CV the application freezes (cv_of_record) — named before he presses.
  const sending = versions.data ? cvOfRecordFor(jobId, versions.data.versions) : null
  const noCv = Boolean(versions.data) && !sending
  const company = listing.data?.company_name || "the company"
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
      const application = await jobs.applyInternship(token, jobId)
      setSentAt(application.applied_at ?? new Date().toISOString())
      void queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      // He applied: it leaves the band on Jobs (hosted_internships_for skips collected jobs).
      void queryClient.invalidateQueries({ queryKey: HOSTED_FOR_YOU_KEY })
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
      {sentAt ? (
        <p className="intern-lead" style={{ marginTop: 18 }}>
          Sent to {company} · {formatDate(sentAt, "medium")}. In <Link href="/collections">Collections</Link>.
        </p>
      ) : hosted ? (
        <div className="intern-actions" style={{ marginTop: 18, flexDirection: "column", alignItems: "flex-start" }}>
          {noCv ? (
            <p className="intern-lead" style={{ margin: 0 }}>
              <Link href="/cv">Add your CV</Link> to apply.
            </p>
          ) : sending ? (
            <p className="intern-lead" style={{ margin: 0 }}>
              Sends {sending.title || "your CV"} ({formatDate(sending.created_at, "short")}), your Myro Score and skills to {company}.
            </p>
          ) : null}
          <button type="button" className="intern-submit" disabled={pending || !listing.data || noCv} onClick={() => void submit()}>
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
