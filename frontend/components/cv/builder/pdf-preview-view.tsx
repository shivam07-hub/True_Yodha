/**
 * PdfPreviewView — enterprise PDF page render + ATS audit card.
 *
 * Light-on-light page with crisp typography; tactical-dark surround.
 * Downloads via the existing /cv/download-pdf endpoint, passing the
 * deterministic snapshot text composed from the playground state.
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import type { CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { Icon } from "./icons"
import { runAtsChecks, atsScore } from "./ats-checks"
import { PdfPage } from "./pdf-page"
import { printCvPage } from "@/lib/cv/print-cv"

interface PdfPreviewViewProps {
  token: string
  cv: CVStructured
  hidden: Set<string>
  selectedVersion: CVVersion | null
  profile: UserProfile | null
  company: string
  jobTitle: string
  matchScore: number
  jobId?: string | null
  onBackToPlayground: () => void
}

function slug(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

export function PdfPreviewView({
  cv, hidden, profile, company, jobTitle, matchScore, jobId, onBackToPlayground,
}: PdfPreviewViewProps) {
  // sessionStorage fallback: job match % may be missing on direct URL / refresh.
  const [effectiveScore, setEffectiveScore] = useState(matchScore)
  useEffect(() => {
    if (effectiveScore <= 0 && jobId) {
      try {
        const stored = sessionStorage.getItem(`myro-cv-score-${jobId}`)
        if (stored) setEffectiveScore(Number(stored))
      } catch { /* storage blocked */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const filename = useMemo(() => {
    const parts = [slug(profile?.full_name) || "myro_cv", slug(company), slug(jobTitle)].filter(Boolean)
    return `${parts.join("__")}.pdf`
  }, [profile, company, jobTitle])

  const checks = useMemo(() => runAtsChecks(cv, profile, filename), [cv, profile, filename])
  const { passed: passedCount, total: totalChecks } = atsScore(checks)

  // WYSIWYG download: the .cvb-pdf-page below IS the document. Browser
  // "Save as PDF" prints exactly what is rendered — selectable text, no
  // plain-text round-trip, no regex re-parse, no orphan bullets.
  function handleDownload() {
    printCvPage(filename)
  }

  const contact = {
    name: profile?.full_name?.trim() || "Your name",
    title: cv.experience[0]?.role ?? "",
    location: profile?.target_location ?? "",
    email: profile?.email ?? "",
    phone: "",
    linkedin: profile?.linkedin_url ?? "",
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div className="cvb-pdf-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" className="cvb-btn ghost" onClick={onBackToPlayground}>
            <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }}/> Back to playground
          </button>
          <div>
            <div className="eyebrow mono">pdf preview</div>
            <div style={{ fontSize: 13, color: "var(--tm-text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="file" size={14} style={{ color: "var(--tm-interactive)" }}/>
              <span className="mono">{filename}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="cvb-pill success">
            <Icon name="check" size={11}/> ATS-friendly · single column
          </span>
          {effectiveScore > 0 && (
            <span className="cvb-pill accent">
              <Icon name="sparkle" size={11}/> {effectiveScore}% JD match
            </span>
          )}
          <button type="button" className="cvb-btn primary" onClick={handleDownload}>
            <Icon name="download" size={14}/>
            Download PDF
          </button>
        </div>
      </div>

      <div className="cvb-pdf-stage">
        <PdfPage cv={cv} hidden={hidden} contact={contact} company={company}/>

        <div style={{ display: "flex", gap: 18, alignItems: "center", fontSize: 11.5, color: "var(--tm-text-faint)", flexWrap: "wrap" }}>
          <span className="mono">A4 · native text · what you see is what downloads</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>Choose “Save as PDF” in the print dialog — fully ATS-parseable.</span>
        </div>

        <div style={{
          width: 816, maxWidth: "100%",
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius)",
          padding: 18,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="sparkle" size={14} style={{ color: "var(--tm-interactive)" }}/>
              <span className="eyebrow" style={{ color: "var(--tm-interactive)" }}>ATS &amp; AI audit</span>
            </div>
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                color: passedCount === totalChecks ? "var(--tm-success)" : "var(--tm-warning)",
              }}
            >
              passes {passedCount} / {totalChecks} checks
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {checks.map(c => (
              <AuditRow key={c.label} ok={c.pass} label={c.pass ? c.label : (c.detail ?? c.label)}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AuditRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--tm-text-muted)" }}>
      <span style={{
        width: 16, height: 16, borderRadius: 4,
        background: ok ? "var(--tm-success-wash)" : "var(--tm-warning-wash)",
        border: "1px solid " + (ok ? "rgba(74,222,128,0.3)" : "rgba(245,158,11,0.3)"),
        display: "grid", placeItems: "center",
        color: ok ? "var(--tm-success)" : "var(--tm-warning)",
      }}>
        <Icon name={ok ? "check" : "x"} size={10} stroke={3}/>
      </span>
      <span>{label}</span>
    </div>
  )
}

