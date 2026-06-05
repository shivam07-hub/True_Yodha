/**
 * Intel drawer — slides from right on desktop, full-screen on mobile.
 * Renders the JD match gauge, matched/missing keyword chips, JD source
 * text, and a compact saved-copy view for this job.
 */
"use client"

import { useEffect } from "react"
import Link from "next/link"
import type { CVVersion } from "@/lib/api"
import { Icon } from "./icons"
import { ScoreGauge } from "./score-gauge"
import { KindDot } from "./commit-graph"
import { formatGlobalVersionLabel, timeAgo } from "@/lib/cv/version-format"
import { formatKeywordChipLabel, type KeywordTarget } from "./keyword-utils"

interface IntelDrawerProps {
  open: boolean
  onClose: () => void
  score: number
  baseScore: number
  matched: KeywordTarget[]
  missing: KeywordTarget[]
  jdText: string
  threadVersions: CVVersion[]
  selectedVId: number | null
  jobLabel: string
}

export function IntelDrawer({
  open, onClose, score, baseScore, matched, missing, jdText,
  threadVersions, selectedVId, jobLabel,
}: IntelDrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const fitLabel = score >= 75 ? "Strong fit" : score >= 60 ? "Good fit" : "Needs work"
  const fitColor = score >= 75 ? "var(--tm-success)" : score >= 60 ? "var(--tm-interactive)" : "var(--tm-warning)"

  return (
    <>
      <div className={`cvb-drawer-backdrop${open ? " open" : ""}`} onClick={onClose} aria-hidden={!open}/>
      <aside
        className={`cvb-drawer${open ? " open" : ""}`}
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label="JD intelligence"
        aria-hidden={!open}
      >
        <div className="cvb-drawer-head">
          <div>
            <div className="eyebrow" style={{ color: "var(--tm-interactive)" }}>jd intel</div>
            <div style={{ fontSize: 14, color: "var(--tm-text)", marginTop: 4 }}>{jobLabel}</div>
          </div>
          <button type="button" className="cvb-btn ghost sm" onClick={onClose} aria-label="Close drawer">
            <Icon name="x" size={14}/>
          </button>
        </div>

        <div className="cvb-drawer-body">
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
            <ScoreGauge value={score} size={140}/>
          </div>
          <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--tm-text-faint)" }}>
            <span style={{ color: fitColor }}>{fitLabel}</span>{" · "}
            <span>Main CV {baseScore}%</span>
          </div>

          <section className="cvb-intel-section">
            <h4>matched · {matched.length}</h4>
            <div className="cvb-kw-chips">
              {matched.length === 0
                ? <span style={{ fontSize: 11.5, color: "var(--tm-text-faint)" }}>None yet.</span>
                : matched.map(k => (
                  <span key={k.kw} className="cvb-kw-chip match" title={k.weight ? `weight ${k.weight}` : undefined}>
                    <span className="dot"/>{formatKeywordChipLabel(k.kw)}
                  </span>
                ))}
            </div>
          </section>

          <section className="cvb-intel-section">
            <h4>missing from cv · {missing.length}</h4>
            <div className="cvb-kw-chips">
              {missing.length === 0
                ? <span style={{ fontSize: 11.5, color: "var(--tm-success)" }}>All JD keywords covered.</span>
                : missing.map(k => (
                  <span key={k.kw} className="cvb-kw-chip miss" title={k.weight ? `weight ${k.weight}` : undefined}>
                    <span className="dot"/>{formatKeywordChipLabel(k.kw)}
                  </span>
                ))}
            </div>
            {missing.length > 0 && (
              <div style={{ fontSize: 11.5, color: "var(--tm-text-faint)", lineHeight: 1.55 }}>
                <Link href="/forge?view=map" style={{ color: "var(--tm-interactive-text)", textDecoration: "none" }}>
                  Practice these gaps →
                </Link>{" "}
                to earn tokens and unlock new bullet drafts.
              </div>
            )}
          </section>

          {jdText.trim().length > 0 && (
            <section className="cvb-intel-section">
              <h4>jd source</h4>
              <div style={{
                padding: 12,
                borderRadius: 6,
                background: "var(--tm-surface)",
                border: "1px solid var(--tm-border-soft)",
                fontSize: 11.5,
                lineHeight: 1.65,
                color: "var(--tm-text-muted)",
                maxHeight: 260,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
              }}>{jdText}</div>
            </section>
          )}

          <section className="cvb-intel-section">
            <h4>saved copies · {threadVersions.length}</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {threadVersions.map(v => (
                <div key={v.id} style={{
                  display: "flex", alignItems: "center", gap: 8, fontSize: 11.5,
                  color: selectedVId === v.id ? "var(--tm-interactive)" : "var(--tm-text-muted)",
                }}>
                  <KindDot kind={v.kind} inline/>
                  <span className="mono" style={{ fontSize: 11 }}>{formatGlobalVersionLabel(v)}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.kind === "baseline_upload"
                      ? "Main CV"
                      : (v.title?.trim()
                          || (v.kind === "polished" ? "AI polished"
                            : v.kind === "edited" ? "Edited copy"
                            : v.kind === "deterministic" ? "Tailored CV"
                            : v.kind))}
                  </span>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--tm-text-faint)" }}>
                    {timeAgo(v.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </>
  )
}
