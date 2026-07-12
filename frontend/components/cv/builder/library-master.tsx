"use client"

import { useMemo, useState } from "react"
import { DownloadCVButton } from "@/components/cv/download-cv-button"
import type { CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { CVExportView } from "./cv-export-view"
import { AppliedVersionsPanel } from "./applied-versions"
import { I, LIcon } from "./library-icons"

interface MasterCVPanelProps {
  token: string
  baseline: CVVersion | null
  cv: CVStructured | null
  profile: UserProfile | null
  onReplace: () => void
  /** Enter the full-bleed master editor (a page-level view, not a nested card). */
  onEditMaster: () => void
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
  token, baseline, cv, profile, onReplace, onEditMaster,
}: MasterCVPanelProps) {
  const [showHistory, setShowHistory] = useState(false)
  const fallbackText = baseline?.body_text?.trim() ?? ""
  const canEdit = !!baseline && !!cv
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
          <button type="button" className="tm-lib-btn sm" onClick={onEditMaster} disabled={!canEdit}>
            <LIcon d={I.edit ?? I.file} size={12}/> Edit
          </button>
          <button
            type="button"
            className={`tm-lib-btn sm${showHistory ? " primary" : ""}`}
            onClick={() => setShowHistory(v => !v)}
            aria-expanded={showHistory}
          >
            <LIcon d={I.pulse} size={12}/> Version history
          </button>
          {/* When a structured CV exists, CVExportView (below) owns download
              — WYSIWYG PDF + DOCX + template picker. Only the text-only
              fallback keeps a head-level download button. */}
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
          <button type="button" className="tm-lib-btn sm" onClick={onReplace}>
            <LIcon d={I.upload} size={12}/> Replace
          </button>
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
          />
        ) : (
          <pre className="tm-lib-master-panel-text">
            {fallbackText || "Your structured CV is still loading — the download below still works."}
          </pre>
        )}
      </div>
    </section>
  )
}
