"use client"

import Link from "next/link"
import { useState } from "react"
import type { ApplicationResponse, ApplicationStatus } from "@/lib/api"
import { APPLICATION_OUTCOMES } from "@/lib/api"
import { STAGE_LABEL, OUTCOME_LABEL, daysBetween } from "./useTrackerBoard"
import type { StageKey, OutcomeKey } from "./useTrackerBoard"
import { StatusPicker } from "./StatusPicker"
import { KebabMenu } from "./KebabMenu"
import { NotesEditor } from "./NotesEditor"
import { OutcomeSeal } from "./OutcomeSeal"
import { ScoreSparkle } from "./ScoreSparkle"

interface Props {
  app: ApplicationResponse
  isStuck?: boolean
  isManual?: boolean
  sparkleTrigger?: number   // bump to fire first-offer sparkle on this card
  onStatusChange: (status: ApplicationStatus) => void
  onWithdraw: () => void
  onDelete: () => void
  onNotesChange: (notes: string) => void
  isMobile?: boolean
}

export function ApplicationCard({
  app, isStuck, isManual, sparkleTrigger = 0,
  onStatusChange, onWithdraw, onDelete, onNotesChange, isMobile,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const isOutcome = (APPLICATION_OUTCOMES as readonly string[]).includes(app.status)
  const outcomeKey = isOutcome ? (app.status as OutcomeKey) : null
  const stageLabel = isOutcome ? OUTCOME_LABEL[app.status as OutcomeKey] : STAGE_LABEL[app.status as StageKey]
  const days = daysBetween(app.last_stage_changed_at ?? app.created_at)

  const stuckRim: React.CSSProperties = isStuck && !isOutcome ? {
    border: "1px dashed rgba(251,191,36,0.5)",
    animation: "tracker-breathe 4s ease-in-out infinite",
  } : {
    border: "1px solid var(--tm-border-soft)",
  }

  return (
    <article
      style={{
        position: "relative",
        borderRadius: "var(--tm-radius, 10px)",
        background: "rgba(255,255,255,0.02)",
        padding: 14,
        transition: "border-color var(--tm-dur, 160ms) var(--tm-ease, ease)",
        ...stuckRim,
      }}
    >
      {outcomeKey && <OutcomeSeal outcome={outcomeKey} />}
      {sparkleTrigger > 0 && <ScoreSparkle trigger={sparkleTrigger} />}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 4,
          }}>
            {isManual ? "Added by you" : stageLabel} · Day {String(days).padStart(2, "0")}
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: "var(--tm-text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {app.title || "Untitled role"}
          </div>
          <div style={{ marginTop: 2, fontSize: 12, color: "var(--tm-text-muted)" }}>
            {app.company ? (
              <Link
                href={`/companies/${encodeURIComponent(app.company)}`}
                style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted var(--tm-border)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-accent)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-text-muted)" }}
              >
                {app.company}
              </Link>
            ) : "—"}
          </div>
        </div>
        {!isOutcome && (
          <KebabMenu onWithdraw={onWithdraw} onDelete={onDelete} />
        )}
      </div>

      <div style={{ height: 1, background: "var(--tm-border-soft)", margin: "10px 0", borderTop: "1px dashed var(--tm-border)" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <NotesEditor initial={app.notes} onSave={onNotesChange} />
        {!isOutcome && (
          <div style={{ position: "relative" }}>
            <button
              onClick={(e) => { e.stopPropagation(); setPickerOpen(o => !o) }}
              style={{
                padding: "4px 10px", borderRadius: 99,
                fontSize: 11, fontFamily: "var(--tm-font-mono)",
                letterSpacing: "0.06em", textTransform: "uppercase",
                background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
                color: "var(--tm-accent)", cursor: "pointer",
              }}
            >
              {stageLabel} ▾
            </button>
            {pickerOpen && (
              <StatusPicker
                current={app.status}
                onPick={(s) => { setPickerOpen(false); onStatusChange(s) }}
                onClose={() => setPickerOpen(false)}
                asSheet={isMobile}
              />
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <Link
          href={`/cv?jobId=${app.job_id}`}
          aria-label={`Tailor CV for ${app.title || "this role"} at ${app.company ?? "company"}`}
          style={{
            fontSize: 12, fontWeight: 600,
            color: "var(--tm-accent)", textDecoration: "none",
            transition: "opacity var(--tm-dur, 160ms) var(--tm-ease, ease)",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.75" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1" }}
        >
          → Tailor CV
        </Link>
      </div>

      <style>{`
        @keyframes tracker-breathe {
          0%, 100% { border-color: rgba(251,191,36,0.4); }
          50%      { border-color: rgba(251,191,36,0.8); }
        }
        @media (prefers-reduced-motion: reduce) {
          article { animation: none !important; }
        }
      `}</style>
    </article>
  )
}
