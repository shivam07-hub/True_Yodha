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

import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { cv as cvApi, jobs as jobsApi, type CVStructured, type UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
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
  /** ISO date the user already marked this job applied, if any — seeds the
   *  close-the-loop tracker so a return visit shows "Applied on …". */
  appliedAt?: string | null
  /** Navigation out of the export surface. */
  onBack?: () => void
  backLabel?: string
}

function slug(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function formatAppliedDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

/** Retry a flaky export call with linear backoff — weak mobile networks (the
 *  core audience) drop a single request often, but a second attempt usually
 *  lands. Keeps the export from failing on one transient blip. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 2, baseDelayMs = 600): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseDelayMs * (i + 1)))
    }
  }
  throw lastErr
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
  template, company, jobTitle, jobId, matchScore = 0, appliedAt = null,
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

  // Grabs the exact `.cvb-pdf-page` the user sees so the server renders the
  // literal previewed DOM. The wrapper is `display:contents` → no layout box,
  // so it cannot affect the sheet's flow.
  const pageWrapRef = useRef<HTMLDivElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  // Close-the-loop: the export is no longer a dead end. Once the tailored CV is
  // saved we nudge the user to record the application so the CV hub doubles as a
  // tracker ("applied to {company} on {date}").
  const [downloaded, setDownloaded] = useState(false)
  const queryClient = useQueryClient()
  const [appliedDate, setAppliedDate] = useState<string | null>(appliedAt)
  const [trackBusy, setTrackBusy] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)

  async function handleDownloadPdf() {
    if (pdfBusy) return
    const sheet = pageWrapRef.current?.querySelector<HTMLElement>(".cvb-pdf-page")
    if (!sheet) {
      // Nothing to grab — use the browser's native Save-as-PDF.
      printCvPage(filename)
      setDownloaded(true)
      return
    }
    setPdfBusy(true)
    try {
      const blob = await withRetry(() => cvApi.exportPdf(token, { html: sheet.outerHTML, filename }))
      triggerBlobDownload(blob, filename, "application/pdf")
    } catch {
      // Server renderer unavailable (503 / network) → native browser print is
      // the WYSIWYG fallback, so the user always gets a real PDF.
      printCvPage(filename)
    } finally {
      setPdfBusy(false)
      setDownloaded(true)
    }
  }

  async function handleMarkApplied() {
    if (trackBusy || !jobId || appliedDate) return
    setTrackBusy(true)
    setTrackError(null)
    try {
      const res = await jobsApi.updateApplication(token, jobId, { status: "applied" })
      setAppliedDate(res.applied_at ?? new Date().toISOString())
      // Refresh the tracker so /cv and the applications view reflect it.
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
    } catch (err) {
      setTrackError(err instanceof Error ? err.message : "Could not record the application.")
    } finally {
      setTrackBusy(false)
    }
  }

  async function handleDownloadDocx() {
    if (docxBusy) return
    setDocxError(null)
    setDocxBusy(true)
    try {
      const visible = selectVisibleCV(cv, hidden)
      const docxName = filename.replace(/\.pdf$/i, "") + ".docx"
      const blob = await withRetry(() => cvApi.exportDocx(token, {
        visible,
        contact,
        template: activeTemplate,
        company: isTailored ? company : undefined,
        filename: docxName,
      }))
      triggerBlobDownload(blob, docxName, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      setDownloaded(true)
    } catch {
      setDocxError("Couldn't build the DOCX — tap Download DOCX to retry.")
    } finally {
      setDocxBusy(false)
    }
  }

  const page = (
    <div ref={pageWrapRef} style={{ display: "contents" }}>
      <PdfPage
        cv={cv}
        hidden={hidden}
        contact={contact}
        company={isTailored ? company : undefined}
        template={activeTemplate}
      />
    </div>
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
            <button type="button" className="cvb-btn primary" onClick={handleDownloadPdf} disabled={pdfBusy}>
              <Icon name="download" size={14} /> {pdfBusy ? "Building PDF…" : "Download PDF"}
            </button>
          </div>
        </div>
        {docxError && <div className="cvb-export-err">{docxError}</div>}
        {/* CV preview leads — it's what the user came for. The DOCX-vs-PDF
            disclosure is a download-time decision, so it sits with the audit
            below the sheet, not between the toolbar and the preview. */}
        <div className="cvb-export-inline-stage">{page}</div>
        <div className="cvb-export-track-nudge">
          PDF suits most ATS — pick DOCX only if the portal asks for a Word file.
        </div>
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
          <button type="button" className="cvb-btn primary" onClick={handleDownloadPdf} disabled={pdfBusy}>
            <Icon name="download" size={14} />
            {pdfBusy ? "Building PDF…" : "Download PDF"}
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
          <span>PDF suits most ATS — pick DOCX only if the portal asks for a Word file.</span>
        </div>

        {(company || jobId) && (
          <div className="cvb-export-apply">
            <div className="eyebrow" style={{ color: "var(--tm-interactive)", marginBottom: 8 }}>
              Apply with this CV
            </div>
            <ApplyRow company={company ?? null} title={jobTitle ?? null} jobId={jobId ?? null} variant="block" />

            {jobId && (
              <div className="cvb-export-track">
                {appliedDate ? (
                  <span className="cvb-pill success">
                    <Icon name="check" size={11} /> Applied{company ? ` to ${company}` : ""} · {formatAppliedDate(appliedDate)}
                  </span>
                ) : (
                  <>
                    {downloaded && (
                      <span className="cvb-export-track-nudge">
                        Saved ✓ — did you apply? Track it so your CV hub remembers.
                      </span>
                    )}
                    <button
                      type="button"
                      className={`cvb-btn ${downloaded ? "primary" : "ghost"}`}
                      onClick={handleMarkApplied}
                      disabled={trackBusy}
                    >
                      <Icon name="check" size={14} /> {trackBusy ? "Saving…" : "Mark as applied"}
                    </button>
                  </>
                )}
                {trackError && <div className="cvb-export-err">{trackError}</div>}
              </div>
            )}
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
