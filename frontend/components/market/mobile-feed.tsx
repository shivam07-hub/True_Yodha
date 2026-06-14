"use client"

import { useEffect, useRef, useState } from "react"
import type { JobFeedItem, JobPulse } from "@/lib/api"
import { PulseRow } from "@/components/dashboard/card-atoms"
import { FeedCard, FeedFitPill, feedCardConfidenceClass } from "@/components/jobs/feed-card"
import { VirtualFeed } from "@/components/jobs/virtual-feed"
import { feedDataFromFeedItem } from "@/lib/jobs/card-view"

const SWIPE_COMMIT = 96   // px past which a release triggers triage
const PEEK_KEY = "myro_feed_swipe_hinted_v1"

/** A compact row card in a vertical scroll feed (X / LinkedIn). Horizontal
 *  swipe = triage (left Skip / right Save), buttons mirror it, tap body opens
 *  detail. Vertical scroll is left to the browser (axis-lock = one axis per
 *  intent). Card body is the shared <FeedCard>. */
function MobileJobCard({
  job, pulse, hasCv, hint, onOpen, onSave, onSkip,
}: {
  job: JobFeedItem
  pulse?: JobPulse
  hasCv: boolean
  hint: boolean
  onOpen: () => void
  onSave: () => void
  onSkip: () => void
}) {
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState<"" | "left" | "right">("")
  const start = useRef<{ x: number; y: number } | null>(null)
  const axisLock = useRef<"" | "x" | "y">("")

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
    axisLock.current = ""
  }
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const ddx = e.clientX - start.current.x
    const ddy = e.clientY - start.current.y
    if (!axisLock.current) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return
      axisLock.current = Math.abs(ddx) > Math.abs(ddy) ? "x" : "y"
    }
    if (axisLock.current === "x") {
      e.preventDefault()
      setDx(ddx)
    }
  }
  const commit = (dir: "left" | "right") => {
    setLeaving(dir)
    setTimeout(() => (dir === "right" ? onSave() : onSkip()), 180)
  }
  const onUp = () => {
    if (axisLock.current === "x") {
      if (dx >= SWIPE_COMMIT) commit("right")
      else if (dx <= -SWIPE_COMMIT) commit("left")
      else setDx(0)
    }
    start.current = null
    axisLock.current = ""
  }

  const intent = dx > 20 ? "save" : dx < -20 ? "skip" : ""
  const translate = leaving === "left" ? -600 : leaving === "right" ? 600 : dx

  return (
    <div className="tm-mfeed-slot">
      {/* triage rails revealed under the card as it slides */}
      <div className={`tm-mfeed-rail tm-mfeed-rail-skip ${intent === "skip" ? "is-armed" : ""}`} aria-hidden>✕ Skip</div>
      <div className={`tm-mfeed-rail tm-mfeed-rail-save ${intent === "save" ? "is-armed" : ""}`} aria-hidden>Save ★</div>
      <FeedCard
        data={feedDataFromFeedItem(job)}
        variant="row"
        extraClass={`${hint ? "tm-mfeed-hint" : ""}${feedCardConfidenceClass(pulse)}`}
        onOpen={() => { if (Math.abs(dx) < 6) onOpen() }}
        articleProps={{
          style: { transform: `translateX(${translate}px) rotate(${translate * 0.015}deg)`, touchAction: "pan-y", userSelect: "none" },
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onUp,
        }}
        fit={<FeedFitPill matchedCount={job.matched_skill_count} roleMatch={job.target_role_match} hasCv={hasCv} />}
        pulse={<PulseRow pulse={pulse} bare />}
        actions={
          <>
            <button type="button" aria-label="Skip" className="tm-triage-btn tm-triage-skip" onClick={e => { e.stopPropagation(); commit("left") }}><span aria-hidden>✕</span> Skip</button>
            <button type="button" aria-label="Save" className="tm-triage-btn tm-triage-save" onClick={e => { e.stopPropagation(); commit("right") }}><span aria-hidden>★</span> Save</button>
          </>
        }
      />
    </div>
  )
}

export function MobileFeed({
  jobs: items, pulses, hasCv, onOpen, onSave, onSkip,
}: {
  jobs: JobFeedItem[]
  pulses: Map<string, JobPulse>
  hasCv: boolean
  onOpen: (j: JobFeedItem) => void
  onSave: (j: JobFeedItem) => void
  onSkip: (j: JobFeedItem) => void
}) {
  const [showHint, setShowHint] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!window.localStorage.getItem(PEEK_KEY)) {
      setShowHint(true)
      window.localStorage.setItem(PEEK_KEY, "1")
      const t = setTimeout(() => setShowHint(false), 1600)
      return () => clearTimeout(t)
    }
  }, [])
  return (
    <VirtualFeed
      items={items}
      getKey={job => job.job_id}
      estimateSize={190}
      gap={14}
      className="tm-mfeed"
      renderItem={(job, i) => (
        <MobileJobCard
          job={job}
          pulse={pulses.get(job.job_id)}
          hasCv={hasCv}
          hint={showHint && i === 0}
          onOpen={() => onOpen(job)}
          onSave={() => onSave(job)}
          onSkip={() => onSkip(job)}
        />
      )}
    />
  )
}
