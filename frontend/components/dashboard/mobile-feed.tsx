"use client"

import * as React from "react"
import { JobCardSlides } from "./job-card"
import { IndexSheet } from "./index-sheet"
import type { OtherRole } from "./lens-company"
import type { FeedItem } from "@/lib/dashboard/feed-model"
import type { ApplicationStatus, SkillGapItem } from "@/lib/api"

const RESUME_KEY = "myro_dashboard_feed_v1"

export interface MobileFeedProps {
  items: FeedItem[]
  allItems: FeedItem[]
  appsByJobId: Record<string, ApplicationStatus>
  token: string
  cartSkillNames: Set<string>
  initialJobId?: string | null
  hasMore: boolean
  onStatus: (jobId: string, s: ApplicationStatus) => void
  onSkillToggle: (s: SkillGapItem) => void
  onRefresh: () => void
}

function otherRolesFor(allItems: FeedItem[], it: FeedItem): OtherRole[] {
  if (!it.company) return []
  return allItems
    .filter((o) => o.jobId !== it.jobId && o.company === it.company)
    .map((o) => ({ jobId: o.jobId, role: o.role, fit: o.fit }))
}

export function MobileFeed(p: MobileFeedProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const cardRefs = React.useRef<Record<string, HTMLElement | null>>({})
  const [activeId, setActiveId] = React.useState<string | null>(p.items[0]?.jobId ?? null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  // Determine the visible card via IntersectionObserver against the VIEWPORT
  // (root: null). The page's own scroll container drives snapping (see
  // `.mc-scope:has(.db-feed)` in dashboard.css) — the feed is NOT a nested
  // scroller, so we must not observe a nested root or the iOS scroll-trap (Q6).
  React.useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            const id = (e.target as HTMLElement).dataset.jobid
            if (id) setActiveId(id)
          }
        }
      },
      { root: null, threshold: [0.6] },
    )
    for (const el of Object.values(cardRefs.current)) if (el) io.observe(el)
    return () => io.disconnect()
  }, [p.items])

  const jumpTo = React.useCallback((jobId: string) => {
    setSheetOpen(false)
    requestAnimationFrame(() => {
      cardRefs.current[jobId]?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [])

  // Deep-link / resume: land on the requested card, else last-seen, once on mount.
  React.useEffect(() => {
    const want = p.initialJobId || sessionStorage.getItem(RESUME_KEY)
    if (want && cardRefs.current[want]) {
      cardRefs.current[want]?.scrollIntoView({ block: "start" })
      setActiveId(want)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (activeId) sessionStorage.setItem(RESUME_KEY, activeId)
  }, [activeId])

  return (
    <div className="db-feed" ref={containerRef}>
      {p.items.map((it) => (
        <section
          key={it.jobId}
          className="db-feed-card"
          data-jobid={it.jobId}
          ref={(el) => { cardRefs.current[it.jobId] = el }}
        >
          <JobCardSlides
            job={it.job}
            status={p.appsByJobId[it.jobId] ?? "saved"}
            token={p.token}
            active={activeId === it.jobId}
            cartSkillNames={p.cartSkillNames}
            otherRoles={otherRolesFor(p.allItems, it)}
            onStatus={(s) => p.onStatus(it.jobId, s)}
            onSkillToggle={p.onSkillToggle}
            onJump={jumpTo}
          />
        </section>
      ))}

      {/* Bottom-of-stack: refresh card (Q7). */}
      <section className="db-feed-card db-feed-end">
        <div className="db-end-inner">
          <div className="db-end-title">That&rsquo;s all {p.items.length}.</div>
          <p className="db-end-sub">Refresh after the next market batch for fresh matches.</p>
          <button type="button" className="db-act-btn accent" onClick={p.onRefresh}>
            Refresh matches →
          </button>
        </div>
      </section>

      <button type="button" className="db-feed-handle" onClick={() => setSheetOpen(true)}>
        {p.items.length} in feed ⌄
      </button>

      {sheetOpen ? (
        <IndexSheet items={p.items} currentJobId={activeId} onJump={jumpTo} onClose={() => setSheetOpen(false)} />
      ) : null}
    </div>
  )
}
