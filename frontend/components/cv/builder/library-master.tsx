"use client"

import { useState } from "react"
import { DownloadCVButton } from "@/components/cv/download-cv-button"
import type { CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { CVExportView } from "./cv-export-view"
import { MasterWorkspace } from "./master-workspace"
import { I, LIcon } from "./library-icons"

// Master CV has no per-job hidden items — every section renders.
const NO_HIDDEN: Set<string> = new Set()

interface MasterCVPanelProps {
  token: string
  baseline: CVVersion | null
  cv: CVStructured | null
  profile: UserProfile | null
  onReplace: () => void
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
  token, baseline, cv, profile, onReplace,
}: MasterCVPanelProps) {
  const [editing, setEditing] = useState(false)
  const fallbackText = baseline?.body_text?.trim() ?? ""
  const canEdit = !!baseline && !!cv

  // Editing is the unified playground surface (owns its own header + autosave).
  if (editing && cv) {
    return <MasterWorkspace token={token} baseline={baseline} cv={cv} profile={profile} onDone={() => setEditing(false)} />
  }

  // A failing ATS row (from CVExportView's audit) enters the editor — the
  // workspace surfaces the actionable content fixes.
  const handleFix = () => setEditing(true)

  return (
    <section className="tm-lib-master-panel tm-lib-fade-in" aria-label="Main CV preview">
      <div className="tm-lib-master-panel-head">
        <div style={{ minWidth: 0 }}>
          <div className="tm-lib-eyebrow">MAIN CV</div>
          <div className="tm-lib-master-panel-title">
            {masterDisplayName(profile)}
            {baseline && <span className="tm-lib-master-version">v{baseline.user_version_number}</span>}
          </div>
        </div>
        <div className="tm-lib-master-panel-actions">
          <button type="button" className="tm-lib-btn sm" onClick={() => setEditing(true)} disabled={!canEdit}>
            <LIcon d={I.edit ?? I.file} size={12}/> Edit
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

      <div className="tm-lib-master-panel-body">
        {cv ? (
          // Master export: the inline skin downloads the CV directly — no
          // tailoring required (the dashboard "Door 2" capability, in-workspace).
          <CVExportView
            token={token}
            cv={cv}
            hidden={NO_HIDDEN}
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
