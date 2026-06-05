/**
 * CVExportView — the single CV export engine.
 *
 * One component renders every download surface, keyed on `context`:
 *   - "tailored"   → full-page skin (Design C), the high-intent /cv/export route
 *   - "master"     → inline skin (Design A), the master-CV panel
 *   - "onboarding" → inline skin, the dashboard "Door 2" (download without tailoring)
 *
 * The `.cvb-pdf-page` it renders (via PdfPage) IS the document: `printCvPage`
 * saves exactly what is shown — real selectable, ATS-parseable text, never a
 * plain-text round-trip. `template` selects the print-CSS variant; the picker
 * persists the choice. DOCX export hits the backend with the SAME visible
 * sections the page shows (via selectVisibleCV), so PDF and DOCX never diverge.
 *
 * Apply-beside-download: when a job context is present, ApplyRow sits next to
 * the download so the user can open the company's careers page in the same
 * breath as saving the tailored CV.
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import { cv as cvApi, type CVStructured, type UserProfile } from "@/lib/api"
import { Icon } from "./icons"
import { runAtsChecks, atsScore } from "./ats-checks"
import { PdfPage, type PdfPageContact } from "./pdf-page"
import { printCvPage } from "@/lib/cv/print-cv"
import { masterFilename } from "@/lib/cv/download-master"
import { selectVisibleCV } from "@/lib/cv/visible-cv"
import { ApplyRow } from "@/components/jobs/apply-row"
import { CV_TEMPLATES, DEFAULT_TEMPLATE, isCVTemplate, type CVTemplate } from "@/lib/cv/templates"

type ExportContext = "tailored" | "master" | "onboarding"

const TEMPLATE_STORAGE_KEY = "myro-cv-template-v1"

interface CVExportViewProps {
  token: string
  cv: CVStructured
  hidden: Set<string>
  contact: PdfPageContact
  profile: UserProfile | null
  context: ExportContext
  /** Initial print-CSS variant. The picker persists the user's choice. */
  template?: CVTemplate
  /** Job context — drives the tailored foot, JD-match pill, and ApplyRow. */
  company?: string
  jobTitle?: string
  jobId?: string | null
  matchScore?: number
  /** Navigation out of the export surface. */
  onBack?: () => void
  backLabel?: string
}

function slug(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function triggerBlobDownload(blob: Blob, filename: string, mime: string) {
  // Wrap in File so mobile Safari + Android Chrome honor the name on blob: URLs.
  const file = new File([blob], filename, { type: mime })
  const url = URL.createObjectURL(file)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CVExportView({
  token, cv, hidden, contact, profile, context,
  template, company, jobTitle, jobId, matchScore = 0,
  onBack, backLabel = "Back",
}: CVExportViewProps) {
  const isTailored = context === "tailored"
  const skin: "fullpage" | "inline" = isTailored ? "fullpage" : "inline"

  // Template: seed from prop → persisted choice → default. Persist on change so
  // the pick sticks across every export surface.
  const [activeTemplate, setActiveTemplate] = useState<CVTemplate>(template ?? DEFAULT_TEMPLATE)
  useEffect(() => {
    if (template) return
    try {
      const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY)
      if (isCVTemplate(saved)) setActiveTemplate(saved)
    } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function pickTemplate(t: CVTemplate) {
    setActiveTemplate(t)
    try { localStorage.setItem(TEMPLATE_STORAGE_KEY, t) } catch { /* storage blocked */ }
  }

  // sessionStorage fallback: job match % may be missing on a direct URL / refresh.
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
    if (isTailored) {
      const parts = [slug(profile?.full_name) || "myro_cv", slug(company), slug(jobTitle)].filter(Boolean)
      return `${parts.join("__")}.pdf`
    }
    return masterFilename(profile?.full_name)
  }, [isTailored, profile, company, jobTitle])

  const checks = useMemo(() => runAtsChecks(cv, profile, filename), [cv, profile, filename])
  const { passed: passedCount, total: totalChecks } = atsScore(checks)

  const [docxBusy, setDocxBusy] = useState(false)
  const [docxError, setDocxError] = useState<string | null>(null)

  function handleDownloadPdf() {
    printCvPage(filename)
  }

  async function handleDownloadDocx() {
    if (docxBusy) return
    setDocxError(null)
    setDocxBusy(true)
    try {
      const visible = selectVisibleCV(cv, hidden)
      const docxName = filename.replace(/\.pdf$/i, "") + ".docx"
      const blob = await cvApi.exportDocx(token, {
        visible,
        contact,
        template: activeTemplate,
        company: isTailored ? company : undefined,
        filename: docxName,
      })
      triggerBlobDownload(blob, docxName, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    } catch (err) {
      setDocxError(err instanceof Error ? err.message : "Could not generate DOCX.")
    } finally {
      setDocxBusy(false)
    }
  }

  const page = (
    <PdfPage
      cv={cv}
      hidden={hidden}
      contact={contact}
      company={isTailored ? company : undefined}
      template={activeTemplate}
    />
  )

  const templatePicker = <TemplatePicker value={activeTemplate} onChange={pickTemplate} />

  const docxButton = (
    <button type="button" className="cvb-btn ghost" onClick={handleDownloadDocx} disabled={docxBusy}>
      <Icon name="file" size={14} /> {docxBusy ? "Building DOCX…" : "Download DOCX"}
    </button>
  )

  const atsCard = (
    <AtsAuditCard checks={checks} passedCount={passedCount} totalChecks={totalChecks} />
  )

  if (skin === "inline") {
    // Compact skin — lives inside a panel (master CV / onboarding door). No
    // sticky full-bleed toolbar; the host surface owns the surround.
    return (
      <div className="cvb-export-inline">
        <div className="cvb-export-inline-bar">
          {templatePicker}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="cvb-pill success">
              <Icon name="check" size={11} /> ATS · {passedCount}/{totalChecks}
            </span>
            {docxButton}
            <button type="button" className="cvb-btn primary" onClick={handleDownloadPdf}>
              <Icon name="download" size={14} /> Download PDF
            </button>
          </div>
        </div>
        {docxError && <div className="cvb-export-err">{docxError}</div>}
        <div className="cvb-export-inline-stage">{page}</div>
        {atsCard}
      </div>
    )
  }

  // Full-page tailored skin (Design C).
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div className="cvb-pdf-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {onBack && (
            <button type="button" className="cvb-btn ghost" onClick={onBack}>
              <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }} /> {backLabel}
            </button>
          )}
          <div>
            <div className="eyebrow mono">cv export</div>
            <div style={{ fontSize: 13, color: "var(--tm-text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="file" size={14} style={{ color: "var(--tm-interactive)" }} />
              <span className="mono">{filename}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {effectiveScore > 0 && (
            <span className="cvb-pill accent">
              <Icon name="sparkle" size={11} /> {effectiveScore}% JD match
            </span>
          )}
          {docxButton}
          <button type="button" className="cvb-btn primary" onClick={handleDownloadPdf}>
            <Icon name="download" size={14} />
            Download PDF
          </button>
        </div>
      </div>

      <div className="cvb-pdf-stage">
        <div className="cvb-export-controls">
          {templatePicker}
          <span className="cvb-pill success">
            <Icon name="check" size={11} /> ATS-friendly · single column
          </span>
        </div>

        {page}

        {docxError && <div className="cvb-export-err">{docxError}</div>}

        <div style={{ display: "flex", gap: 18, alignItems: "center", fontSize: 11.5, color: "var(--tm-text-faint)", flexWrap: "wrap" }}>
          <span className="mono">A4 · native text · what you see is what downloads</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>Choose &ldquo;Save as PDF&rdquo; in the print dialog — fully ATS-parseable.</span>
        </div>

        {(company || jobId) && (
          <div className="cvb-export-apply">
            <div className="eyebrow" style={{ color: "var(--tm-interactive)", marginBottom: 8 }}>
              Apply with this CV
            </div>
            <ApplyRow company={company ?? null} title={jobTitle ?? null} jobId={jobId ?? null} variant="block" />
          </div>
        )}

        {atsCard}
      </div>
    </div>
  )
}

function TemplatePicker({ value, onChange }: { value: CVTemplate; onChange: (t: CVTemplate) => void }) {
  return (
    <div className="cvb-tpl-picker" role="radiogroup" aria-label="CV template">
      {CV_TEMPLATES.map(t => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          className={`cvb-tpl-chip${value === t.id ? " is-active" : ""}`}
          onClick={() => onChange(t.id)}
          title={t.description}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function AtsAuditCard({
  checks, passedCount, totalChecks,
}: {
  checks: ReturnType<typeof runAtsChecks>
  passedCount: number
  totalChecks: number
}) {
  return (
    <div className="cvb-export-ats">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="sparkle" size={14} style={{ color: "var(--tm-interactive)" }} />
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
          <AuditRow key={c.label} ok={c.pass} label={c.pass ? c.label : (c.detail ?? c.label)} />
        ))}
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
        <Icon name={ok ? "check" : "x"} size={10} stroke={3} />
      </span>
      <span>{label}</span>
    </div>
  )
}
