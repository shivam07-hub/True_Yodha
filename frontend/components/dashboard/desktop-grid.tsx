"use client"

import * as React from "react"
import { DetailBody, jdSnippet } from "./detail-body"
import { Monogram, FitRing, ChipRow, CardActions, cardChips } from "./card-atoms"
import { LocationLine } from "./lenses"
import type { OtherRole } from "./lens-company"
import type { FeedItem } from "@/lib/dashboard/feed-model"
import type { ApplicationStatus, SkillGapItem } from "@/lib/api"

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
  onOpen,
  onLike,
  onSkip,
  detail,
}: {
  it: FeedItem
  open: boolean
  liked: boolean
  applied: boolean
  onOpen: () => void
  onLike: () => void
  onSkip: () => void
  detail: React.ReactNode
}) {
  const fit = it.fit
  const snippet = jdSnippet(it.job.job_description)
  return (
    <article className={`db-card${open ? " open" : ""}`}>
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
      <CardActions jobId={it.jobId} liked={liked} onLike={onLike} onSkip={onSkip} />
    </article>
  )
}

export function DesktopGrid(p: DesktopGridProps) {
  const [openId, setOpenId] = React.useState<string | null>(p.initialJobId ?? null)

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
