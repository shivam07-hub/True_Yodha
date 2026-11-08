"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs, type HostedReviewItem } from "@/lib/api"
import { ApiError } from "@/lib/api-error"
import { getAccessToken } from "@/lib/session"
import { formatDate } from "@/lib/format"
import { FeedCard } from "@/components/jobs/feed-card"
import { feedDataFromFeedItem } from "@/lib/jobs/card-view"
import "./internships.css"

const QUEUE_KEY = ["internship-review-queue"] as const

function Held({ item, token }: { item: HostedReviewItem; token: string }) {
  const queryClient = useQueryClient()
  const decide = useMutation({
    mutationFn: (decision: "clear" | "refuse") => jobs.reviewInternship(token, item.job_id, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUEUE_KEY }),
  })
  return (
    <section className="intern-post">
      <p className="intern-poster">
        {item.poster_email || "No email on the account"}
        {item.first_seen ? ` · ${formatDate(item.first_seen, "short")}` : ""}
      </p>
      <FeedCard data={{ ...feedDataFromFeedItem(item, { hasCv: false }), fit: null }} variant="row" />
      <p className="intern-review-text">{item.job_description}</p>
      <div className="intern-actions">
        <button type="button" className="intern-submit" disabled={decide.isPending} onClick={() => decide.mutate("clear")}>
          Clear
        </button>
        <button type="button" className="intern-secondary" disabled={decide.isPending} onClick={() => decide.mutate("refuse")}>
          Refuse
        </button>
      </div>
      {decide.isError ? (
        <p className="intern-error">{decide.error instanceof ApiError ? decide.error.message : "Could not save"}</p>
      ) : null}
    </section>
  )
}

/** Posts held until a person at Myro looks, so a fake internship never reaches a seeker. */
export function InternshipReview() {
  const [token, setToken] = useState<string | null | undefined>(undefined)
  useEffect(() => setToken(getAccessToken()), [])
  const queue = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => jobs.reviewQueue(token as string),
    enabled: Boolean(token),
  })

  if (token === undefined || (token && queue.isLoading)) {
    return <main className="intern-page" aria-busy="true" />
  }
  if (!token) {
    return (
      <main className="intern-page">
        <h1 className="intern-title">Internships to check</h1>
        <Link href="/login">Sign in</Link>
      </main>
    )
  }
  if (queue.isError) {
    return (
      <main className="intern-page">
        <h1 className="intern-title">Internships to check</h1>
        <p className="intern-error">
          {queue.error instanceof ApiError ? queue.error.message : "Could not load the queue"}
        </p>
      </main>
    )
  }
  const held = queue.data?.jobs ?? []
  return (
    <main className="intern-page">
      <p className="intern-kicker">
        <Link href="/admin/growth">Distribution Tracker</Link>
      </p>
      <h1 className="intern-title">Internships to check{held.length > 0 ? ` · ${held.length}` : ""}</h1>
      {held.length === 0 ? <p className="intern-empty">Nothing to check</p> : null}
      {held.map((item) => <Held key={item.job_id} item={item} token={token} />)}
    </main>
  )
}
