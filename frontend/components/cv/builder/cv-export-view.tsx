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
import { Button } from "@/components/ui/button"
import { Icon } from "./icons"
import { runAtsChecks, atsScore, type AtsFixTarget } from "./ats-checks"
import { AtsAudit } from "./ats-audit"
import { focusEditorSection } from "./cv-edit-focus"
import { formatDate } from "@/lib/format"
import { PdfPage, type PdfPageContact } from "./pdf-page"
import { printCvPage } from "@/lib/cv/print-cv"
import { exportSheetPdf, triggerBlobDownload, withRetry } from "@/lib/cv/sheet-pdf"
import { masterFilename } from "@/lib/cv/download-master"
import { selectVisibleCV } from "@/lib/cv/visible-cv"
import { ApplyRow } from "@/components/jobs/apply-row"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { ApplyCapturePrompt } from "@/components/jobs/apply-capture-prompt"
import { CV_TEMPLATES, DEFAULT_TEMPLATE, isCVTemplate, type CVTemplate } from "@/lib/cv/templates"
import { MobileCVExportLayout } from "@/components/cv/mobile/mobile-cv-export-layout"

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
  /** CV Version this surface renders. Enables the Myro-mark toggle (authed). */
  versionId?: number | null
  /** Initial footer-mark state for `versionId`. */
  footerMarkHidden?: boolean
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
  /** Mobile full-screen composition; shares the same export handlers and PdfPage. */
  mobile?: boolean
  onFixContact?: () => void
  /** Route a failing audit check into the editor. When set, audit rows route
   *  here instead of the same-page section scroll. */
  onAtsFix?: (target: AtsFixTarget) => void
  /** CV workspace provenance rail — see PdfPage for the WYSIWYG-safety note. */
  onBulletClick?: (id: string, text: string) => void
  selectedBulletId?: string | null
}

function slug(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function formatAppliedDate(iso: string): string {
  return formatDate(iso, "medium")
}

export function CVExportView({
  token, cv, hidden, contact, profile, context,
  template, versionId = null, footerMarkHidden = false,
  company, jobTitle, jobId, matchScore = 0, appliedAt = null,
  onBack, backLabel = "Back", mobile = false, onFixContact, onAtsFix,
  onBulletClick, selectedBulletId = null,
}: CVExportViewProps) {
  const isTailored = context === "tailored"
  const skin: "fullpage" | "inline" = isTailored ? "fullpage" : "inline"

  // Apply Transport — the official-opening affordance is a leave-to-apply, so it
  // arms the liveness capture too (only when tied to a real job_id; a master
  // export has none). company careers is the destination.
  const capture = useApplyCapture({
    token,
    job: { job_id: jobId ?? "", source_url: null, company: company ?? null },
    surface: "other",
    intentSurface: "cv_export",
    onSubmitted: recordSubmittedCv,
  })

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
      const parts = [slug(contact.name) || "myro_cv", slug(company), slug(jobTitle)].filter(Boolean)
      return `${parts.join("__")}.pdf`
    }
    return masterFilename(contact.name || profile?.full_name)
  }, [isTailored, contact.name, profile?.full_name, company, jobTitle])

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

  // Myro footer mark (per-version certified state). Optimistic toggle; the
  // backend is the source of truth, so we revert on failure.
  const [markHidden, setMarkHidden] = useState(footerMarkHidden)
  const [markBusy, setMarkBusy] = useState(false)
  useEffect(() => { setMarkHidden(footerMarkHidden) }, [footerMarkHidden])

  async function toggleMark() {
    if (!versionId || markBusy) return
    const next = !markHidden
    setMarkHidden(next)
    setMarkBusy(true)
    try {
      await cvApi.versions.setFooterMark(token, versionId, next)
      queryClient.invalidateQueries({ queryKey: ["cv-versions"] })
    } catch {
      setMarkHidden(!next) // revert — backend rejected
    } finally {
      setMarkBusy(false)
    }
  }

  const [appliedDate, setAppliedDate] = useState<string | null>(appliedAt)
  const [trackBusy, setTrackBusy] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)
  const submittedSnapshotWritten = useRef(false)
  useEffect(() => { submittedSnapshotWritten.current = false }, [jobId])

  async function recordSubmittedCv() {
    if (!jobId || submittedSnapshotWritten.current) return
    const visible = selectVisibleCV(cv, hidden)
    await cvApi.applySnapshot(token, {
      job_id: jobId,
      cv_snapshot: {
        title: jobTitle ?? "", company: company ?? "", score: effectiveScore,
        structured: visible, hidden: Array.from(hidden),
      },
      cv_version_id: versionId,
      applied_url: capture.href,
    }).catch(() => {})
    submittedSnapshotWritten.current = true
  }

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
      await exportSheetPdf(token, sheet, filename)
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
      await recordSubmittedCv()
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
        footerMarkHidden={markHidden}
        onBulletClick={onBulletClick}
        selectedBulletId={selectedBulletId}
      />
    </div>
  )

  const templatePicker = <TemplatePicker value={activeTemplate} onChange={pickTemplate} />

  // The footer mark is an explicit export preference. The preview is the proof;
  // no vague recommendation claim is needed beside the control.
  const markToggle = versionId ? (
    <div className="cvb-mark-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={!markHidden}
        className={`cvb-mark-switch${markHidden ? "" : " is-on"}`}
        onClick={toggleMark}
        disabled={markBusy}
        title={markHidden ? "Add the Myro mark to certify this CV" : "Remove the Myro mark"}
      >
        <Icon name={markHidden ? "x" : "check"} size={11} />
        {markHidden ? "Add Myro mark" : "Myro Certified"}
      </button>
      <span className="cvb-mark-note">Shown in the exported CV footer.</span>
    </div>
  ) : null

  const docxButton = (
    <Button variant="ghost" onClick={handleDownloadDocx} disabled={docxBusy}>
      <Icon name="file" size={14} /> {docxBusy ? "Building DOCX…" : "Download DOCX"}
    </Button>
  )

  // Failing rows route into the master editor sections, which live on the same
  // page as this card in the "master" context. Other contexts have no editor
  // mounted, so the audit renders read-only there.
  const atsCard = (
    <AtsAudit checks={checks} onFix={onAtsFix ?? (context === "master" ? focusEditorSection : undefined)} />
  )

  if (mobile && onBack) {
    return (
      <MobileCVExportLayout
        page={page}
        template={activeTemplate}
        onTemplateChange={pickTemplate}
        checks={checks}
        passedCount={passedCount}
        totalChecks={totalChecks}
        markHidden={markHidden}
        markBusy={markBusy}
        canToggleMark={Boolean(versionId)}
        onToggleMark={toggleMark}
        onFixContact={onFixContact}
        pdfBusy={pdfBusy}
        docxBusy={docxBusy}
        docxError={docxError}
        onDownloadPdf={handleDownloadPdf}
        onDownloadDocx={handleDownloadDocx}
        onBack={onBack}
      />
    )
  }

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
            <Button onClick={handleDownloadPdf} disabled={pdfBusy}>
              <Icon name="download" size={14} /> {pdfBusy ? "Building PDF…" : "Download PDF"}
            </Button>
          </div>
        </div>
        {docxError && <div className="cvb-export-err">{docxError}</div>}
        {markToggle}
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
            <Button variant="ghost" onClick={onBack}>
              <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }} /> {backLabel}
            </Button>
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
          {company && capture.href && (
            <Button
              variant="neutral"
              title={`Find ${company} opening on its official careers site`}
              render={
                <a
                  href={capture.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={jobId ? capture.onApply : undefined}
                />
              }
            >
              ↗ {capture.target.actionLabel}
            </Button>
          )}
          <Button onClick={handleDownloadPdf} disabled={pdfBusy}>
            <Icon name="download" size={14} />
            {pdfBusy ? "Building PDF…" : "Download PDF"}
          </Button>
        </div>
        {jobId ? <ApplyCapturePrompt capture={capture} /> : null}
      </div>

      <div className="cvb-pdf-stage">
        <div className="cvb-export-controls">
          {templatePicker}
          <span className="cvb-pill success">
            <Icon name="check" size={11} /> ATS-friendly · single column
          </span>
        </div>

        {markToggle}

        {page}

        {docxError && <div className="cvb-export-err">{docxError}</div>}

        <div style={{ fontSize: 11.5, color: "var(--tm-text-faint)" }}>
          PDF suits most ATS — pick DOCX only if the portal asks for a Word file.
        </div>

        {(company || jobId) && (
          <div className="cvb-export-apply">
            <div className="eyebrow" style={{ color: "var(--tm-interactive)", marginBottom: 8 }}>
              Apply with this CV
            </div>
            <ApplyRow company={company ?? null} title={jobTitle ?? null} jobId={jobId ?? null} variant="block" hideCareers={Boolean(company)} onApply={capture.onApply} />

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
                    <Button
                      variant={downloaded ? "solid" : "ghost"}
                      onClick={handleMarkApplied}
                      disabled={trackBusy}
                    >
                      <Icon name="check" size={14} /> {trackBusy ? "Saving…" : "Mark as applied"}
                    </Button>
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
