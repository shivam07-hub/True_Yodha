"use client"

/**
 * ClosingPanel — the room once an outcome lands (grill Q7). Outcomes are a
 * parallel terminal set (offer | rejected | ghosted): one seals the room.
 *
 * The "What you keep" strip inverts loss aversion: the stories banked while
 * prepping here are permanent — they raise the starting coverage of every
 * future application. Rejection ends the application, not the work.
 */

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { cv as cvApi, jobs as jobsApi, type ApplicationResponse } from "@/lib/api"
import { ReviewModal } from "@/components/cv/pipeline/ReviewModal"

const OUTCOME_LINE: Record<string, string> = {
  offer: "Offer received.",
  rejected: "They said no this time.",
  ghosted: "No response — logged as ghosted.",
}

export function ClosingPanel({
  token, app,
}: { token: string; app: ApplicationResponse }) {
  const [reviewOpen, setReviewOpen] = React.useState(false)
  const [reviewed, setReviewed] = React.useState(false)

  // The coverage cache holds the stories this room banked/matched — that's the
  // "what you keep" count. Passive read; no fetch if the room never loaded it.
  const coverage = useQuery({
    queryKey: ["jd-coverage", app.job_id],
    queryFn: () => cvApi.career.jdCoverage(token, app.job_id),
    enabled: !!token && !!app.job_id,
    staleTime: 5 * 60 * 1000,
  })
  const kept = (coverage.data?.requirements ?? []).filter((r) => r.story_id).length

  const isOffer = app.status === "offer"

  return (
    <div>
      {isOffer ? (
        <div className="prp-offer-banner">
          <div className="big">🎉 Offer at {app.company ?? "this company"}</div>
          <div className="sub">The prep worked. Log how the process went — it sharpens Myro for everyone.</div>
        </div>
      ) : (
        <p className="prp-sec-note">{OUTCOME_LINE[app.status] ?? "Closed."}</p>
      )}

      {kept > 0 && (
        <div className="prp-close-keep" style={{ marginTop: 14 }}>
          <span className="n">{kept}</span>
          <span>
            {kept === 1 ? "story" : "stories"} banked while preparing here — they stay yours,
            and every future application starts with them already matched.
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        {!reviewed ? (
          <button type="button" className="prp-btn" onClick={() => setReviewOpen(true)}>
            {isOffer ? "Log the win" : "Log how it went"}
          </button>
        ) : (
          <span className="prp-quiet" style={{ alignSelf: "center" }}>✓ Logged — thanks.</span>
        )}
        {!isOffer && (
          <Link href="/market" className="prp-btn" style={{ textDecoration: "none" }}>
            Find similar roles →
          </Link>
        )}
      </div>

      {reviewOpen && (
        <ReviewModal
          company={app.company ?? null}
          defaultStage={app.status === "ghosted" ? "applied" : "interviewing"}
          onClose={() => setReviewOpen(false)}
          onSubmit={async (data) => {
            await jobsApi.submitReview(token, app.job_id, data)
            setReviewed(true)
            setReviewOpen(false)
          }}
        />
      )}
    </div>
  )
}
