"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { jobs, type EmployerStatus, type HostedPost } from "@/lib/api"
import { FeedCard } from "@/components/jobs/feed-card"
import { feedDataFromFeedItem } from "@/lib/jobs/card-view"
import { formatDate } from "@/lib/format"
import { ReachCount } from "./reach-count"
import { applicantsKey } from "./keys"
import "./internships.css"

const STATE_LABEL: Record<NonNullable<HostedPost["hosted_review"]>, string> = {
  pending: "In review",
  cleared: "Live",
  refused: "Not cleared",
}

export const EMPLOYER_LABEL: Record<EmployerStatus, string> = {
  seen: "Seen",
  shortlisted: "Shortlisted",
  passed: "Passed",
}

function Applicants({ token, post }: { token: string; post: HostedPost }) {
  const { data } = useQuery({
    queryKey: applicantsKey(post.job_id),
    queryFn: () => jobs.internshipApplicants(token, post.job_id),
    enabled: post.applicant_count > 0,
    staleTime: 30_000,
  })
  if (post.applicant_count === 0) return <p className="intern-empty">No applicants yet</p>
  return (
    <ul className="intern-applicants">
      {(data?.applicants ?? []).map((a) => (
        <li key={a.application_id}>
          <Link href={`/recruiters/${encodeURIComponent(post.job_id)}/applicants/${a.application_id}`}>
            <span className="intern-applicant-name">{a.name}</span>
            <span className="intern-applicant-meta">
              {formatDate(a.applied_at, "short")}
              {a.employer_status ? ` · ${EMPLOYER_LABEL[a.employer_status]}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Her internship(s): the state, who it reaches, the card as seekers see it, who applied. */
export function RecruiterHome({ token, posts }: { token: string; posts: HostedPost[] }) {
  return (
    <main className="intern-page">
      {posts.map((post) => {
        const state = post.hosted_review ?? "cleared"
        return (
          <section key={post.job_id} className="intern-post">
            <p className="intern-kicker">{STATE_LABEL[state]}</p>
            <h1 className="intern-title">{post.job_title}</h1>
            {state === "pending" ? (
              <p className="intern-lead">
                Seekers see this under Apply here once Myro checks it, within a day. We email you when it is live.
              </p>
            ) : null}
            <ReachCount
              input={{
                city: post.location ?? "",
                remote: post.location_mode === "remote",
                skills: post.skills ?? [],
              }}
            />
            {/* The listing as a seeker sees it, minus the per-viewer fit slot:
                without a CV that slot asks the viewer to upload one. */}
            <FeedCard data={{ ...feedDataFromFeedItem(post, { hasCv: false }), fit: null }} variant="row" />
            {state === "cleared" ? (
              <>
                <h2 className="intern-subtitle">
                  Applicants{post.applicant_count > 0 ? ` · ${post.applicant_count}` : ""}
                </h2>
                <Applicants token={token} post={post} />
              </>
            ) : null}
          </section>
        )
      })}
    </main>
  )
}
