"use client"

import { useMatchBrain } from "@/lib/hooks/use-match-brain"
import { useSkillUpvotes } from "@/lib/hooks/use-skill-upvotes"
import { jobPlanSections } from "@/lib/jobs/detail-model"
import { ListingLiveness } from "@/components/jobs/listing-liveness"
import { BottomSheet } from "./bottom-sheet"
import type { MobileJobRow } from "./job-model"

/* ══════════════════════════════════════════════════════════════════════════
   JobDetailSheet — the handoff job-detail sheet. Header (logo/grade/role/ring)
   → why-you-fit → already-match → skills-to-build → footer (Save/Skip/Tailor/
   Apply). Skill levels + authored "why" prose aren't on the feed payload, so
   those degrade gracefully (skill name only; summary as the why).
   ══════════════════════════════════════════════════════════════════════════ */

const CIRC = 119.4 // 2π·19 — the 46px detail ring

export interface JobDetailData {
  row: MobileJobRow
  whyFit: string
  matched: string[]
  gaps: string[]
  saved: boolean
  /** Saved rows only — the heart is priority intent, as on desktop. */
  prioritized?: boolean
  canDismiss?: boolean
  hasApply: boolean
  applyLabel?: string
}

export function JobDetailSheet({
  open,
  onClose,
  data,
  token,
  onHeart,
  onSkip,
  onTailor,
  onApply,
  captureSlot,
}: {
  open: boolean
  onClose: () => void
  data: JobDetailData | null
  /** When given, opening the sheet WARMS the Matching Brain for this job
   *  (on_demand.ensure_job_eval) and shows its summary as the "why" — the mobile
   *  half of brain-everywhere (Backlog #36 Slice 3). Opening a mobile job now
   *  warms its verdict, exactly like the desktop drawer's MyroTake. */
  token?: string | null
  onHeart: () => void
  onSkip: () => void
  onTailor: () => void
  onApply: () => void
  /** Apply Transport liveness band — rendered above the footer after an apply. */
  captureSlot?: React.ReactNode
}) {
  // Hooks must run before the early return (rules of hooks). The brain fetch
  // only runs while the sheet is open for a real job — that call both warms the
  // cache and gives us the brain's summary to show as the "why".
  const { result: brain } = useMatchBrain(token, open && data ? data.row.id : null)
  const upvotes = useSkillUpvotes(token)
  if (!data) return <BottomSheet open={open} onClose={onClose} label="Job detail" maxHeight="88%"><div /></BottomSheet>
  const { row, matched, gaps, saved, prioritized = false, hasApply, applyLabel = "Apply", canDismiss = true } = data
  // Prefer the brain's real "why this fits you" summary over the static JD slice.
  const whyFit = (brain?.available ? brain.summary : null) || data.whyFit

  // Section order + gating from the ONE Job Plan contract shared with the
  // desktop drawer (lib/jobs/detail-model) — mobile just supports fewer slots.
  const sections = jobPlanSections({
    hasWhy: !!whyFit,
    matchedCount: matched.length,
    buildCount: gaps.length,
    supports: { reach: false, jd: false, company: false, notes: false },
  })

  return (
    <BottomSheet open={open} onClose={onClose} label="Job detail" maxHeight="88%">
      <div className="mm-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 18px 14px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: row.logoBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: "#fff", flex: "none" }}>{row.coInitial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 650, color: "var(--mm-accent)" }}>{row.co}</span>
              {row.hasGrade && <span style={{ fontSize: 10, fontWeight: 700, color: row.gradeFg, border: `1px solid ${row.gradeBd}`, borderRadius: 5, padding: "0.5px 4px" }}>{row.grade}</span>}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25, marginTop: 2 }}>{row.role}</div>
            <div style={{ fontSize: 12, color: "var(--mm-faint)", marginTop: 3 }}>{[row.metaLine, row.verified].filter(Boolean).join(" · ")}</div>
          </div>
          <div style={{ position: "relative", width: 46, height: 46, flex: "none" }}>
            <svg width={46} height={46} viewBox="0 0 46 46" aria-hidden="true">
              <circle cx="23" cy="23" r="19" fill="none" stroke="var(--mm-border)" strokeWidth="3.4" />
              <circle cx="23" cy="23" r="19" fill="none" stroke={row.ringColor} strokeWidth="3.4" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - row.fit / 100)} transform="rotate(-90 23 23)" />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "var(--mm-text)" }}>{row.fit}</div>
          </div>
        </div>

        {/* Same liveness verdict, same words as desktop — one model, two skins. */}
        <div style={{ marginTop: 10 }}>
          <ListingLiveness jobId={row.id} />
        </div>

        {row.checkDetails && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--mm-warn)", background: "rgba(245,158,11,0.09)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "8px 11px" }}>
            ⚠ Check details before applying — some listing fields looked off when Myro verified it.
          </div>
        )}

        {sections.includes("why") && (
          <div style={{ marginTop: 14 }}>
            <div style={sectionLabel}>Why you fit</div>
            <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--mm-text-2)" }}>{whyFit}</p>
          </div>
        )}

        {sections.includes("skills") && matched.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={sectionLabel}>You already match · {matched.length}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
              {matched.map((name, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--mm-hair)" }}>
                  <span style={{ color: "var(--mm-good)", fontSize: 11 }}>✓</span>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {sections.includes("skills") && gaps.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={sectionLabel}>Skills to build · {gaps.length}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
              {gaps.map((name, i) => {
                // Upvote = "I want to learn this", counted per job — ▲3 means
                // 3 of my jobs need it. Orders Practice; fill is optimistic.
                const on = upvotes.upvotedFor(name, row.id)
                const count = upvotes.countFor(name)
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--mm-hair)" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                    <button
                      onClick={() => upvotes.toggle({ skill_key: name }, row.id)}
                      aria-pressed={on}
                      aria-label={`Upvote ${name} to practice`}
                      className="mm-press-sm"
                      style={{
                        height: 24, minWidth: 40, padding: "0 10px", borderRadius: 99,
                        border: `1px solid ${on ? "var(--mm-accent)" : "rgba(255,255,255,0.09)"}`,
                        background: on ? "rgba(79,199,246,0.08)" : "transparent",
                        color: on ? "var(--mm-accent)" : "var(--mm-text-3)",
                        fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: "none",
                      }}
                    >
                      ▲{count > 0 ? ` ${count}` : ""}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {captureSlot ? <div style={{ flex: "none", padding: "0 16px", background: "var(--mm-card-2)" }}>{captureSlot}</div> : null}

      <div style={{ flex: "none", display: "flex", gap: 8, padding: "11px 16px 16px", borderTop: "1px solid var(--mm-hair)", background: "var(--mm-card-2)" }}>
        {canDismiss ? (
          <>
            {/* Saved row → priority intent (desktop parity). Unsaved match →
                the save itself, which has no desktop counterpart here. Removal
                is the X beside it, never this button. */}
            <button
              onClick={onHeart}
              aria-label={saved ? (prioritized ? "Remove job priority" : "Prioritize this job") : "Save"}
              aria-pressed={saved ? prioritized : undefined}
              className="mm-press-sm"
              style={footBtn}
            >
              <svg width={17} height={17} viewBox="0 0 24 24" fill={saved && prioritized ? "currentColor" : "none"} stroke={saved && prioritized ? "var(--mm-accent)" : "var(--mm-muted)"} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.5-1.5 2-3.2 2-4.6C21 6.4 18.6 4 15.6 4 14.2 4 12.9 4.6 12 5.6 11.1 4.6 9.8 4 8.4 4 5.4 4 3 6.4 3 9.4c0 1.4.5 3.1 2 4.6l7 6.6 7-6.6Z" /></svg>
            </button>
            <button onClick={onSkip} aria-label="Not interested" className="mm-press-sm tm-dismiss-action" style={footBtn}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </>
        ) : null}
        <button onClick={onTailor} className="mm-press" style={{ flex: 1, height: 42, borderRadius: 13, border: "none", background: "var(--mm-accent)", color: "var(--mm-accent-fg)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.01em" }}>Tailor CV</button>
        {hasApply && (
          <button onClick={onApply} className="mm-press-sm" style={{ height: 42, padding: "0 14px", borderRadius: 13, border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "var(--mm-text)", fontSize: 13, fontWeight: 650, cursor: "pointer", fontFamily: "inherit", flex: "none" }}>{applyLabel} ↗</button>
        )}
      </div>
    </BottomSheet>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--mm-faint)", textTransform: "uppercase",
}
const footBtn: React.CSSProperties = {
  width: 42, height: 42, borderRadius: 13, border: "1px solid rgba(255,255,255,0.09)", background: "transparent",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none",
}
