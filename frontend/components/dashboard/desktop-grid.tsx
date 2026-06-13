"use client"

import * as React from "react"
import { DetailBody, jdSnippet } from "./detail-body"
import { Monogram, FitRing, ChipRow, CardActions, cardChips, PulseRow, cardConfidenceClass } from "./card-atoms"
import { LocationLine } from "./lenses"
import type { OtherRole } from "./lens-company"
import { usePulses } from "@/lib/hooks/use-pulses"
import type { FeedItem } from "@/lib/dashboard/feed-model"
import type { ApplicationStatus, JobPulse, SkillGapItem } from "@/lib/api"

export interface DesktopGridProps {
  items: FeedItem[]
  allItems: FeedItem[]
  appsByJobId: Record<string, ApplicationStatus>
  token: string
  cartSkillNames: Set<string>
  initialJobId?: string | null
  onStatus: (jobId: string, s: ApplicationStatus) => void
  onRemove: (jobId: string) => void
  onSkillToggle: (s: SkillGapItem) => void
}

const APPLIED_STATUSES: ReadonlySet<ApplicationStatus> = new Set<ApplicationStatus>([
  "applied",
  "screening",
  "interviewing",
  "final_round",
])

function otherRolesFor(allItems: FeedItem[], it: FeedItem): OtherRole[] {
  if (!it.company) return []
  return allItems
    .filter((o) => o.jobId !== it.jobId && o.company === it.company)
    .map((o) => ({ jobId: o.jobId, role: o.role, fit: o.fit }))
}

/** One collapsed card (+ inline detail when open). */
function JobCard({
  it,
  open,
  liked,
  applied,
  pulse,
  onOpen,
  onLike,
  onSkip,
  detail,
}: {
  it: FeedItem
  open: boolean
  liked: boolean
  applied: boolean
  pulse?: JobPulse
  onOpen: () => void
  onLike: () => void
  onSkip: () => void
  detail: React.ReactNode
}) {
  const fit = it.fit
  const snippet = jdSnippet(it.job.job_description)
  // Skip / unlike animate the card out, THEN remove it — so the feed doesn't
  // jump (the removal is optimistic + instant, so we delay it one beat).
  const [leaving, setLeaving] = React.useState(false)
  const leaveThen = (fn: () => void) => {
    setLeaving(true)
    window.setTimeout(fn, 230)
  }
  return (
    <article className={`db-card${open ? " open" : ""}${leaving ? " is-leaving" : ""}${cardConfidenceClass(pulse)}`}>
      <div
        className="db-card-main"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onOpen()
          }
        }}
      >
        <Monogram company={it.company} />
        <div className="db-card-body">
          <div className="db-card-toprow">
            <span className="db-card-co">{it.company ?? "—"}</span>
            {applied ? <span className="db-statuschip">Applied</span> : null}
            {!it.isMatch ? <span className="db-sourcechip">You added</span> : null}
          </div>
          <h3 className="db-card-role">{it.role}</h3>
          <LocationLine job={it.job} />
          {snippet ? <p className="db-snippet">{snippet}</p> : null}
          <ChipRow chips={cardChips(it.job)} className="db-card-chips" />
        </div>
        {fit != null ? (
          <div className="db-card-fit">
            <FitRing fit={fit} />
            <span className="db-fitcap">fit</span>
          </div>
        ) : null}
      </div>
      {open ? detail : null}
      <PulseRow pulse={pulse} />
      <CardActions
        jobId={it.jobId}
        liked={liked}
        onLike={liked ? () => leaveThen(onLike) : onLike}
        onSkip={() => leaveThen(onSkip)}
      />
    </article>
  )
}

export function DesktopGrid(p: DesktopGridProps) {
  const [openId, setOpenId] = React.useState<string | null>(p.initialJobId ?? null)

  // One batched pulse request for the whole visible set (not one-per-card).
  const pulses = usePulses(p.token, p.items.map((it) => it.jobId))

  // Close if the open job left the visible set (segment change / skip).
  React.useEffect(() => {
    if (openId && !p.items.some((it) => it.jobId === openId)) setOpenId(null)
  }, [p.items, openId])

  return (
    <div className="db-feed">
      {p.items.map((it) => {
        const open = openId === it.jobId
        const applied = APPLIED_STATUSES.has(p.appsByJobId[it.jobId] ?? "saved")
        return (
          <JobCard
            key={it.jobId}
            it={it}
            open={open}
            liked={it.isLiked}
            applied={applied}
            pulse={pulses.get(it.jobId)}
            onOpen={() => setOpenId(open ? null : it.jobId)}
            onLike={() => (it.isLiked ? p.onRemove(it.jobId) : p.onStatus(it.jobId, "saved"))}
            onSkip={() => p.onRemove(it.jobId)}
            detail={
              <DetailBody
                job={it.job}
                token={p.token}
                active={open}
                cartSkillNames={p.cartSkillNames}
                otherRoles={otherRolesFor(p.allItems, it)}
                onSkillToggle={p.onSkillToggle}
                onJump={(jobId) => setOpenId(jobId)}
                showHead={false}
              />
            }
          />
        )
      })}
    </div>
  )
}
