"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type AgentPickItem, type JobFeedItem } from "@/lib/api"
import { JobCard } from "@/components/market/job-card"
import { JobDetailDrawer } from "@/components/market/job-detail-drawer"
import { NotInterestedUndo } from "@/components/jobs/not-interested-undo"
import { agentPicksQueryKey } from "@/lib/jobs/job-triage-cache"
import { useAgentPickTriage } from "@/components/jobs/use-agent-pick-triage"
import "./agent-picks-band.css"

/* ══════════════════════════════════════════════════════════════════════════
   Myro Agent Picks — editorial NOTE above the algorithm feed, not a second
   card. The job itself is the same undecided JobCard (Skip · Save · Share)
   used below the divider. Rank, comment and tier sit above it. A lone Save
   pill here was an accident, not a product decision.
   ══════════════════════════════════════════════════════════════════════════ */

const TIER_LABEL: Record<string, string> = {
  bullseye: "Bullseye",
  strong: "Strong",
  reach: "Reach",
}

function AgentPickCard({
  pick, hasCv, onOpen, onSave, onSkip,
}: {
  pick: AgentPickItem
  hasCv: boolean
  onOpen: () => void
  onSave: () => void
  onSkip: () => void
}) {
  const tier = (pick.agent_tier ?? "").toLowerCase()
  return (
    <div className={`tm-agentpick tier-${tier}`}>
      <div className="tm-agentpick-note">
        <span className="tm-agentpick-rank" aria-label={`Pick ${pick.agent_rank}`}>{pick.agent_rank}</span>
        <p className="tm-agentpick-why">{pick.agent_comment}</p>
        {TIER_LABEL[tier] ? <span className="tm-agentpick-tier">{TIER_LABEL[tier]}</span> : null}
      </div>
      <JobCard job={pick} hasCv={hasCv} onOpen={onOpen} onSave={onSave} onSkip={onSkip} />
    </div>
  )
}

export interface AgentPicksBandProps {
  token: string
  hasCv?: boolean
  /** "feed" = the algorithm-feed divider copy follows (market); "collections" =
   *  a lighter divider (the user's saved list follows). */
  context?: "feed" | "collections"
  /** Jobs tab passes its feed triage so one undo slot covers pick and feed. */
  onSave?: (job: JobFeedItem) => void
  onSkip?: (job: JobFeedItem) => void
}

export function AgentPicksBand({
  token, hasCv = true, context = "feed", onSave, onSkip,
}: AgentPicksBandProps) {
  const [openJob, setOpenJob] = React.useState<AgentPickItem | null>(null)
  const triage = useAgentPickTriage({ token, onSave, onSkip })

  const q = useQuery({
    queryKey: agentPicksQueryKey(token),
    queryFn: () => jobsApi.agentPicks(token),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  })

  const picks = q.data?.picks ?? []
  if (!picks.length) return null

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
            onOpen={() => setOpenJob(pick)}
            onSave={() => triage.save(pick)}
            onSkip={() => triage.skip(pick)}
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
          onSave={() => { triage.save(openJob); setOpenJob(null) }}
        />
      ) : null}

      {triage.pending ? (
        <NotInterestedUndo
          kind={triage.pending.kind}
          jobId={triage.pending.jobId}
          token={token}
          onUndo={triage.undo}
        />
      ) : null}
    </section>
  )
}
