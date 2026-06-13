"use client"

import { useEffect, useRef, useState } from "react"
import type { JobFeedItem, JobPulse } from "@/lib/api"
import { ageLabel, jdSnippet, LocationLine, SkillChip, FitSignal } from "./job-card"
import { PulseRow, cardConfidenceClass } from "@/components/dashboard/card-atoms"

const SWIPE_COMMIT = 96   // px past which a release triggers triage
const PEEK_KEY = "myro_feed_swipe_hinted_v1"

/** A tall (~75vh) card. Horizontal swipe = triage (left Skip / right Save),
 *  buttons mirror it, tap body opens detail. Vertical scroll is left to the
 *  browser (one axis per intent). */
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
  const age = ageLabel(job.first_seen)
  const snippet = jdSnippet(job.job_description, 260)
  const translate = leaving === "left" ? -600 : leaving === "right" ? 600 : dx

  return (
    <div className="tm-mfeed-slot">
      {/* triage rails revealed under the card as it slides */}
      <div className={`tm-mfeed-rail tm-mfeed-rail-skip ${intent === "skip" ? "is-armed" : ""}`} aria-hidden>✕ Skip</div>
      <div className={`tm-mfeed-rail tm-mfeed-rail-save ${intent === "save" ? "is-armed" : ""}`} aria-hidden>Save ★</div>
      <article
        className={`tm-mfeed-card ${hint ? "tm-mfeed-hint" : ""} ${leaving ? "tm-mfeed-leaving" : ""}${cardConfidenceClass(pulse)}`}
        style={{ transform: `translateX(${translate}px) rotate(${translate * 0.02}deg)`, touchAction: "pan-y" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => { if (Math.abs(dx) < 6) onOpen() }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.25 }}>{job.job_title}</h3>
            {job.company_name ? <div style={{ fontSize: 15, color: "var(--tm-interactive)", marginTop: 4 }}>{job.company_name}</div> : null}
          </div>
          {age ? <span style={{ flexShrink: 0, fontFamily: "var(--tm-font-mono)", fontSize: 10, color: "var(--tm-text-faint)" }}>{age}</span> : null}
        </div>
        <LocationLine job={job} />
        <FitSignal job={job} hasCv={hasCv} />
        {snippet ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--tm-text-muted)", flex: 1 }}>{snippet}</p> : null}
        {job.skills.length > 0 ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{job.skills.slice(0, 4).map(s => <SkillChip key={s} label={s} />)}</div> : null}
        <PulseRow pulse={pulse} bare />
        <div className="tm-mfeed-actions">
          <button type="button" aria-label="Skip" className="tm-triage-btn tm-triage-skip" onClick={e => { e.stopPropagation(); commit("left") }}><span aria-hidden>✕</span> Skip</button>
          <button type="button" aria-label="Save" className="tm-triage-btn tm-triage-save" onClick={e => { e.stopPropagation(); commit("right") }}><span aria-hidden>★</span> Save</button>
        </div>
      </article>
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
    <div className="tm-mfeed">
      {items.map((job, i) => (
        <MobileJobCard
          key={job.job_id}
          job={job}
          pulse={pulses.get(job.job_id)}
          hasCv={hasCv}
          hint={showHint && i === 0}
          onOpen={() => onOpen(job)}
          onSave={() => onSave(job)}
          onSkip={() => onSkip(job)}
        />
      ))}
    </div>
  )
}
