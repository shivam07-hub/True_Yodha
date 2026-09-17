"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type AgentPickItem, type JobFeedItem } from "@/lib/api"
import { JobCard } from "@/components/market/job-card"
import { JobDetailDrawer } from "@/components/market/job-detail-drawer"
import { NotInterestedUndo } from "@/components/jobs/not-interested-undo"
import { AgentPickLede } from "@/components/jobs/agent-pick-lede"
import { agentPicksQueryKey } from "@/lib/jobs/job-triage-cache"
import { useAgentPickTriage } from "@/components/jobs/use-agent-pick-triage"
import "./agent-picks-band.css"

/* ══════════════════════════════════════════════════════════════════════════
   Myro Agent Picks — the surface's own card, carrying Myro's reason for the
   pick INSIDE it (`lede`). The reason used to sit above the card with its own
   rank marker and a tier pill, so one job read as two objects and the pill made
   a second claim about how good it was, beside a ring already making that claim.

   On /market that card is the undecided JobCard (Skip · Save · Share) used
   below the divider. Inside the Ops folder it is the collection row, because
   the job there is already collected — leaving Save as the hero would have put
   "Save" and "Tailor CV" on one screen as peers for the same decision. The
   surface supplies its card through `renderCard`; the band never picks one for
   a surface it does not belong to. A surface that supplies its own card owns
   where the reason goes, and Collections already opens each pick on Why — so the
   lede rides the market card only, and no surface says the same thing twice.
   ══════════════════════════════════════════════════════════════════════════ */

export interface AgentPicksBandProps {
  token: string
  hasCv?: boolean
  /** "feed" = the algorithm-feed divider copy follows (market); "collections" =
   *  a lighter divider (more above-bar matches follow). */
  context?: "feed" | "collections"
  /** The surface's own card. Omitted on /market, where the band's card IS the
   *  market JobCard. Returning null drops a pick the surface cannot render —
   *  e.g. one the user has since dismissed. */
  renderCard?: (pick: AgentPickItem) => React.ReactNode
  /** Jobs tab passes its feed triage so one undo slot covers pick and feed. */
  onSave?: (job: JobFeedItem) => void
  onSkip?: (job: JobFeedItem) => void
}

export function AgentPicksBand({
  token, hasCv = true, context = "feed", onSave, onSkip, renderCard,
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
  // Build the cards BEFORE deciding whether there is a band. A surface that
  // supplies its own card may decline a pick (`renderCard` → null) — on
  // Collections, every pick is declined until the record lands — and the band
  // used to render its title, its "Hand-vetted by Myro's career brain" promise
  // and its closing divider over nothing at all.
  const cards = picks
    .map((pick) => ({ pick, card: renderCard ? renderCard(pick) : null }))
    .filter((row) => !renderCard || row.card !== null)
  if (!cards.length) return null

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
        {cards.map(({ pick, card }) => (
          <React.Fragment key={pick.job_id}>
            {card ?? (
              <JobCard
                job={pick}
                hasCv={hasCv}
                onOpen={() => setOpenJob(pick)}
                onSave={() => triage.save(pick)}
                onSkip={() => triage.skip(pick)}
                lede={<AgentPickLede pick={pick} />}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="tm-agentpicks-divider" role="separator">
        <span className="tm-agentpicks-divider-line" aria-hidden />
        {context === "collections" ? (
          <p className="tm-agentpicks-divider-copy">
            {/* What follows on this stage is MORE above-bar matches, not saves.
                The old copy named the wrong list. */}
            <strong>Those are Myro’s picks for you.</strong> The rest that cleared the bar are below.
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
