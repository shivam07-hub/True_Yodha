"use client"

import { useEffect, useMemo, useState } from "react"
import { DownloadCVButton } from "@/components/cv/download-cv-button"
import type { CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { CVExportView, TemplatePicker } from "./cv-export-view"
import { AppliedVersionsPanel } from "./applied-versions"
import { DEFAULT_TEMPLATE, isCVTemplate, type CVTemplate } from "@/lib/cv/templates"

const TEMPLATE_STORAGE_KEY = "myro-cv-template-v1"

interface MasterCVPanelProps {
  token: string
  baseline: CVVersion | null
  cv: CVStructured | null
  profile: UserProfile | null
  /** Enter the full-bleed master editor (a page-level view, not a nested card). */
  onEditMaster: () => void
  /** Version-history toggle lives on the flow ribbon, above this panel — owned
   *  by the parent so it can sit next to Edit/Replace in one action row. */
  showHistory: boolean
  /** CV workspace provenance rail (see PdfPage). */
  onBulletClick?: (id: string, text: string) => void
  selectedBulletId?: string | null
}

function masterDisplayName(profile: UserProfile | null): string {
  return profile?.full_name?.trim() || "Your Name"
}

function masterContact(cv: CVStructured | null, profile: UserProfile | null) {
  const contact = cv?.contact
  return {
    name: contact?.name?.trim() || masterDisplayName(profile),
    title: contact?.title?.trim() || cv?.experience[0]?.role || profile?.target_roles?.[0] || "",
    location: contact?.location?.trim() || profile?.target_location || "",
    email: contact?.email?.trim() || "",
    phone: contact?.phone?.trim() || "",
    linkedin: contact?.linkedin?.trim() || profile?.linkedin_url || "",
  }
}

export function MasterCVPanel({
  token, baseline, cv, profile, onEditMaster, showHistory,
  onBulletClick, selectedBulletId = null,
}: MasterCVPanelProps) {
  const fallbackText = baseline?.body_text?.trim() ?? ""

  // Template pick is owned here (not inside CVExportView) so the picker can
  // render in this panel's head instead of a separate row lower down — same
  // persisted choice, same key, every export surface still agrees.
  const [activeTemplate, setActiveTemplate] = useState<CVTemplate>(DEFAULT_TEMPLATE)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY)
      if (isCVTemplate(saved)) setActiveTemplate(saved)
    } catch { /* storage blocked */ }
  }, [])
  function pickTemplate(t: CVTemplate) {
    setActiveTemplate(t)
    try { localStorage.setItem(TEMPLATE_STORAGE_KEY, t) } catch { /* storage blocked */ }
  }
  // The master's shape = the CV the user last applied with (Delta-4 living
  // master, project_living_cv_delta4). Render + download honor its hidden_items
  // so the promoted projection is exactly what the user sees and exports.
  const masterHidden = useMemo(() => new Set(baseline?.hidden_items ?? []), [baseline?.hidden_items])

  // A failing ATS row (from CVExportView's audit) enters the full-bleed editor
  // (a page-level view) — the workspace surfaces the actionable content fixes.
  const handleFix = onEditMaster

  return (
    <section className="tm-lib-master-panel tm-lib-fade-in" aria-label="Main CV preview">
      <div className="tm-lib-master-panel-head">
        <div style={{ minWidth: 0 }}>
          <div className="tm-lib-eyebrow">MAIN CV</div>
          <div className="tm-lib-master-panel-title">
            {masterDisplayName(profile)}
          </div>
        </div>
        <div className="tm-lib-master-panel-actions">
          {/* When a structured CV exists, CVExportView (below) owns download
              — WYSIWYG PDF + DOCX. Only the text-only fallback keeps a
              head-level download button. */}
          {!cv && (
            <DownloadCVButton
              token={token}
              baseline={baseline}
              cv={cv}
              fullName={profile?.full_name}
              className="tm-lib-btn primary sm"
              label="Download Main CV"
            />
          )}
          {cv && <TemplatePicker value={activeTemplate} onChange={pickTemplate} />}
        </div>
      </div>

      {showHistory && (
        <div className="tm-lib-master-panel-body" style={{ paddingBottom: 4 }}>
          <div className="tm-lib-eyebrow" style={{ marginBottom: 8 }}>CVS YOU&apos;VE APPLIED WITH</div>
          <AppliedVersionsPanel token={token} />
        </div>
      )}

      <div className="tm-lib-master-panel-body">
        {cv ? (
          // Master export: the inline skin downloads the CV directly — no
          // tailoring required (the dashboard "Door 2" capability, in-workspace).
          <CVExportView
            token={token}
            cv={cv}
            hidden={masterHidden}
            contact={masterContact(cv, profile)}
            profile={profile}
            context="master"
            versionId={baseline?.id ?? null}
            footerMarkHidden={baseline?.footer_mark_hidden ?? false}
            onAtsFix={handleFix}
            onBulletClick={onBulletClick}
            selectedBulletId={selectedBulletId}
            template={activeTemplate}
            onTemplateChange={pickTemplate}
            hidePicker
          />
        ) : fallbackText ? (
          <pre className="tm-lib-master-panel-text">
            {fallbackText}
          </pre>
        ) : null}
      </div>
    </section>
  )
}
