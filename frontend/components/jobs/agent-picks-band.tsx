"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type AgentPickItem } from "@/lib/api"
import { FeedCard } from "@/components/jobs/feed-card"
import { GradeBadge, LegitimacyBadge } from "@/components/jobs/match-brain"
import { CapturePill } from "@/components/jobs/capture-pill"
import { feedDataFromFeedItem } from "@/lib/jobs/card-view"
import { JobDetailDrawer } from "@/components/market/job-detail-drawer"
import "./agent-picks-band.css"

/* ══════════════════════════════════════════════════════════════════════════
   Myro Agent Picks — the CURATED editorial band above the algorithm feed.
   A hand-vetted shortlist cut by the Career-Ops brain (the roles a user is told
   to actually apply to), walled off from the algorithm-matched feed by a clear
   divider. Distinct from /matches (algorithm layer, rewritten each recompute) —
   these survive recompute and only change when we cut a fresh recommendation set.
   Renders nothing when a user has no picks → zero footprint for everyone else.
   ══════════════════════════════════════════════════════════════════════════ */

const TIER_LABEL: Record<string, string> = {
  bullseye: "Bullseye",
  strong: "Strong",
  reach: "Reach",
}

function AgentBrainBadges({ job }: { job: AgentPickItem }) {
  if (!job.grade && job.legitimacy_tier !== "caution" && job.legitimacy_tier !== "suspicious") return null
  return (
    <>
      <GradeBadge grade={job.grade} />
      <LegitimacyBadge tier={job.legitimacy_tier} reason={job.legitimacy_reason} />
    </>
  )
}

function AgentPickCard({
  pick, hasCv, saved, onOpen, onSave, onTailor,
}: {
  pick: AgentPickItem
  hasCv: boolean
  saved: boolean
  onOpen: () => void
  onSave: () => void
  onTailor: () => void
}) {
  const tier = (pick.agent_tier ?? "").toLowerCase()
  const label = pick.job_title
    ? `${pick.job_title}${pick.company_name ? ` at ${pick.company_name}` : ""}`
    : undefined
  return (
    <div className={`tm-agentpick tier-${tier}`}>
      <div className="tm-agentpick-note">
        <span className="tm-agentpick-rank" aria-label={`Pick ${pick.agent_rank}`}>{pick.agent_rank}</span>
        <p className="tm-agentpick-why">{pick.agent_comment}</p>
        {TIER_LABEL[tier] ? <span className="tm-agentpick-tier">{TIER_LABEL[tier]}</span> : null}
      </div>
      <FeedCard
        data={feedDataFromFeedItem(pick, { hasCv })}
        variant="row"
        onOpen={onOpen}
        badges={<AgentBrainBadges job={pick} />}
        actions={
          <CapturePill
            status={saved ? "saved" : "rest"}
            onSave={onSave}
            onTailor={onTailor}
            label={label}
          />
        }
      />
    </div>
  )
}

export interface AgentPicksBandProps {
  token: string
  hasCv?: boolean
  /** "feed" = the algorithm-feed divider copy follows (market); "collections" =
   *  a lighter divider (the user's saved list follows). */
  context?: "feed" | "collections"
}

export function AgentPicksBand({ token, hasCv = true, context = "feed" }: AgentPicksBandProps) {
  const router = useRouter()
  const [saved, setSaved] = React.useState<Set<string>>(new Set())
  const [openJob, setOpenJob] = React.useState<AgentPickItem | null>(null)

  const q = useQuery({
    queryKey: ["agentPicks", token],
    queryFn: () => jobsApi.agentPicks(token),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  })

  const picks = q.data?.picks ?? []
  // Ambient: never a loading shimmer or an empty box — the band simply isn't there
  // until there are picks to show (design-over-words).
  if (!picks.length) return null

  const onSave = (pick: AgentPickItem) => {
    setSaved(prev => new Set(prev).add(pick.job_id))
    void jobsApi.saveJob(token, pick.job_id).catch(() => {
      setSaved(prev => { const next = new Set(prev); next.delete(pick.job_id); return next })
    })
  }
  const onTailor = (pick: AgentPickItem) => router.push(`/cv?jobId=${encodeURIComponent(pick.job_id)}`)

  return (
    <section className="tm-agentpicks" aria-label="Myro Agent picks">
      <header className="tm-agentpicks-head">
        <div className="tm-agentpicks-title">
          <span aria-hidden className="tm-agentpicks-mark">✦</span>
          <h2>Myro Agent Picks</h2>
        </div>
        <p className="tm-agentpicks-sub">
          Hand-vetted by Myro’s career brain for your level, goals and city. Start here.
        </p>
      </header>

      <div className="tm-agentpicks-list">
        {picks.map(pick => (
          <AgentPickCard
            key={pick.job_id}
            pick={pick}
            hasCv={hasCv}
            saved={saved.has(pick.job_id)}
            onOpen={() => setOpenJob(pick)}
            onSave={() => onSave(pick)}
            onTailor={() => onTailor(pick)}
          />
        ))}
      </div>

      <div className="tm-agentpicks-divider" role="separator">
        <span className="tm-agentpicks-divider-line" aria-hidden />
        {context === "collections" ? (
          <p className="tm-agentpicks-divider-copy">
            <strong>Those are Myro’s picks for you.</strong> Your saved jobs are below.
          </p>
        ) : (
          <p className="tm-agentpicks-divider-copy">
            <strong>That’s the end of your Agent picks.</strong> Everything below is matched by
            algorithm alone — ranked on skill overlap, not hand-checked. Browse and save what you
            like, but the picks above are the ones worth your application time. Fresh picks land
            after the next market scan.
          </p>
        )}
      </div>

      {openJob ? (
        <JobDetailDrawer
          job={openJob}
          token={token}
          onClose={() => setOpenJob(null)}
          onSave={() => { onSave(openJob); setOpenJob(null) }}
        />
      ) : null}
    </section>
  )
}
