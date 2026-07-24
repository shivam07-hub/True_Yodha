/* Gap readiness map (Surface B payoff). Bands carry icon + text (never color
   alone) per PRD §9 (1.4.1). Ported from the design handoff. */

"use client"

import type { JSX } from "react"
import type { ReadinessRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Icon, type IconName } from "./icons"
import { PROFICIENCY } from "./proficiency"

const BAND_META: Record<ReadinessRow["band"], { label: string; icon: IconName; cls: string }> = {
  ready: { label: "Ready", icon: "check", cls: "up-band-ready" },
  close: { label: "Close", icon: "bolt", cls: "up-band-close" },
  gap: { label: "Gap", icon: "cross", cls: "up-band-gap" },
}

function LevelLadderReadout({ assessed, target }: { assessed: number; target: number }): JSX.Element {
  return (
    <div className="up-readout" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((lvl) => {
        const hit = lvl <= assessed
        const need = lvl <= target
        return (
          <div
            key={lvl}
            className={`up-readout-seg${hit ? " hit" : need ? " need" : ""}${lvl === target ? " target" : ""}`}
            title={`L${lvl}`}
          />
        )
      })}
    </div>
  )
}

export function GapReadiness({
  job,
  rows,
  overallPct,
  onPractice,
  onBack,
}: {
  job: { title: string; company: string | null }
  rows: ReadinessRow[]
  overallPct: number
  onPractice: (row: ReadinessRow) => void
  onBack: () => void
}): JSX.Element {
  const ready = rows.filter((r) => r.band === "ready").length
  return (
    <div className="up-results up-readiness" role="region" aria-label="Readiness map">
      <div className="up-sr-only" role="status" aria-live="polite">
        Overall readiness {overallPct} percent. {ready} of {rows.length} required skills ready.
      </div>

      <button type="button" className="up-link" onClick={onBack} style={{ alignSelf: "flex-start" }}>
        <Icon name="back" size={14} /> Back to upskilling
      </button>

      <section className="up-card up-ready-hero">
        <div className="up-ready-pct">{overallPct}<span className="up-ready-pct-sym">%</span></div>
        <div style={{ minWidth: 0 }}>
          <h2 tabIndex={-1} style={{ outline: "none" }}>Readiness for <span className="up-ready-job">{job.title}</span></h2>
          <p>
            {job.company ? `${job.company} · ` : ""}assessed your real level across {rows.length} required skills.
            {" "}{ready} ready, {rows.length - ready} to close before you apply.
          </p>
        </div>
      </section>

      <div className="up-review-h">Per required skill — assessed vs target</div>
      <div className="up-rev-list">
        {rows.map((r) => {
          const m = BAND_META[r.band]
          return (
            <div key={r.skill_key} className="up-card up-ready-row">
              <div className="r-id">
                <div className="r-name">{r.skill}</div>
                <div className="r-lvls">
                  Assessed L{r.assessed_level} · {PROFICIENCY[r.assessed_level]} → target L{r.target_level} · {PROFICIENCY[r.target_level]}
                </div>
                <div className="up-readout-wrap">
                  <LevelLadderReadout assessed={r.assessed_level} target={r.target_level} />
                </div>
              </div>
              <div className="up-ready-mini">
                <span className={`up-band ${m.cls}`}><Icon name={m.icon} size={13} /> {m.label}</span>
                {r.band !== "ready" ? (
                  <Button size="sm" onClick={() => onPractice(r)}>
                    Practice this <Icon name="arrow" size={14} />
                  </Button>
                ) : (
                  <span className="up-ready-meets">Meets the bar</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="up-res-unlock up-readiness-note">
        <Icon name="sparkle" size={15} /> Calibration is diagnostic — it measures, it doesn&apos;t pay. Practice the gaps in Upskilling to earn Myro Coins and raise your real level.
      </div>
    </div>
  )
}
