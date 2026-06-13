"use client"

import * as React from "react"
import { ChevronLeft, Heart, X } from "lucide-react"
import { DetailBody, jdSnippet } from "./detail-body"
import { Monogram, ChipRow, CardActions, cardChips, PulseRow, cardConfidenceClass } from "./card-atoms"
import { LocationLine } from "./lenses"
import type { OtherRole } from "./lens-company"
import { usePulses } from "@/lib/hooks/use-pulses"
import type { FeedItem } from "@/lib/dashboard/feed-model"
import type { ApplicationStatus, JobPulse, SkillGapItem } from "@/lib/api"

export interface MobileFeedProps {
  items: FeedItem[]
  allItems: FeedItem[]
  appsByJobId: Record<string, ApplicationStatus>
  token: string
  cartSkillNames: Set<string>
  initialJobId?: string | null
  hasMore: boolean
  onStatus: (jobId: string, s: ApplicationStatus) => void
  onRemove: (jobId: string) => void
  onSkillToggle: (s: SkillGapItem) => void
  onRefresh: () => void
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

/* ── Edge-to-edge feed card ─────────────────────────────────────── */
function MobileCard({
  it,
  liked,
  applied,
  pulse,
  onOpen,
  onLike,
  onSkip,
}: {
  it: FeedItem
  liked: boolean
  applied: boolean
  pulse?: JobPulse
  onOpen: () => void
  onLike: () => void
  onSkip: () => void
}) {
  const snippet = jdSnippet(it.job.job_description)
  const [leaving, setLeaving] = React.useState(false)
  const leaveThen = (fn: () => void) => {
    setLeaving(true)
    window.setTimeout(fn, 230)
  }
  return (
    <div
      className={`db-mcard${leaving ? " is-leaving" : ""}${cardConfidenceClass(pulse)}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <Monogram company={it.company} size={40} />
      <div className="db-mcard-body">
        <div className="db-mcard-top">
          <span className="co">{it.company ?? "—"}</span>
          {applied ? <span className="db-statuschip">Applied</span> : null}
          {it.fit != null ? <span className="mfit">{it.fit}% fit</span> : null}
        </div>
        <h3 className="db-mrole">{it.role}</h3>
        <LocationLine job={it.job} />
        {snippet ? <p className="db-msnip">{snippet}</p> : null}
        <ChipRow chips={cardChips(it.job)} className="db-mchips" />
        <PulseRow pulse={pulse} mobile />
        <CardActions
          jobId={it.jobId}
          liked={liked}
          onLike={liked ? () => leaveThen(onLike) : onLike}
          onSkip={() => leaveThen(onSkip)}
          mobile
        />
      </div>
    </div>
  )
}

/* ── Full-screen detail push ────────────────────────────────────── */
function MobileDetail({
  it,
  liked,
  allItems,
  token,
  cartSkillNames,
  onBack,
  onLike,
  onSkip,
  onSkillToggle,
  onJump,
}: {
  it: FeedItem
  liked: boolean
  allItems: FeedItem[]
  token: string
  cartSkillNames: Set<string>
  onBack: () => void
  onLike: () => void
  onSkip: () => void
  onSkillToggle: (s: SkillGapItem) => void
  onJump: (jobId: string) => void
}) {
  return (
    <div className="db-mdetail" role="dialog" aria-label={`${it.role} details`}>
      <div className="db-mdetail-top">
        <button type="button" className="db-icon-btn" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={16} aria-hidden />
        </button>
        <span className="ttl">{it.company ?? it.role}</span>
      </div>
      <div className="db-mdetail-scroll">
        <DetailBody
          job={it.job}
          token={token}
          active
          cartSkillNames={cartSkillNames}
          otherRoles={otherRolesFor(allItems, it)}
          onSkillToggle={onSkillToggle}
          onJump={onJump}
          showHead
        />
      </div>
      <div className="db-mdetail-bar">
        <button
          type="button"
          className={`db-icon-btn${liked ? " liked" : ""}`}
          aria-label={liked ? "Unlike" : "Like"}
          onClick={onLike}
        >
          <Heart size={18} fill={liked ? "currentColor" : "none"} aria-hidden />
        </button>
        <button
          type="button"
          className="db-icon-btn"
          aria-label="Skip"
          onClick={() => {
            onSkip()
            onBack()
          }}
        >
          <X size={18} aria-hidden />
        </button>
        <a className="db-btn db-btn-primary" href={`/cv?jobId=${it.jobId}`}>
          Tailor CV
        </a>
      </div>
    </div>
  )
}

export function MobileFeed(p: MobileFeedProps) {
  const [detailId, setDetailId] = React.useState<string | null>(p.initialJobId ?? null)
  const detailItem = p.items.find((it) => it.jobId === detailId) ?? null

  // One batched pulse request for the whole visible set (not one-per-card).
  const pulses = usePulses(p.token, p.items.map((it) => it.jobId))

  // Close the push if the open job left the visible set.
  React.useEffect(() => {
    if (detailId && !p.items.some((it) => it.jobId === detailId)) setDetailId(null)
  }, [p.items, detailId])

  const onLike = (it: FeedItem) => (it.isLiked ? p.onRemove(it.jobId) : p.onStatus(it.jobId, "saved"))

  return (
    <div className="db-mfeed">
      <div className="db-mpull">
        <span className="db-label">↓ pull to refresh · next batch tonight</span>
      </div>

      {p.items.map((it) => (
        <MobileCard
          key={it.jobId}
          it={it}
          liked={it.isLiked}
          applied={APPLIED_STATUSES.has(p.appsByJobId[it.jobId] ?? "saved")}
          pulse={pulses.get(it.jobId)}
          onOpen={() => setDetailId(it.jobId)}
          onLike={() => onLike(it)}
          onSkip={() => p.onRemove(it.jobId)}
        />
      ))}

      <div className="db-mfeed-end">
        That&rsquo;s all {p.items.length} ·{" "}
        <button
          type="button"
          onClick={p.onRefresh}
          style={{ background: "none", border: "none", color: "var(--db-accent-text)", cursor: "pointer", font: "inherit" }}
        >
          refresh after the next batch
        </button>
      </div>

      {detailItem ? (
        <MobileDetail
          it={detailItem}
          liked={detailItem.isLiked}
          allItems={p.allItems}
          token={p.token}
          cartSkillNames={p.cartSkillNames}
          onBack={() => setDetailId(null)}
          onLike={() => onLike(detailItem)}
          onSkip={() => p.onRemove(detailItem.jobId)}
          onSkillToggle={p.onSkillToggle}
          onJump={(jobId) => setDetailId(jobId)}
        />
      ) : null}
    </div>
  )
}
