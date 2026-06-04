"use client"

import { useState } from "react"
import { DownloadCVButton } from "@/components/cv/download-cv-button"
import type { CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { PdfPage } from "./pdf-page"
import { MasterEditor } from "./master-editor"
import { ApertureMark, timeAgoShort } from "./library-shared"
import { I, LIcon } from "./library-icons"
import { CloseButton } from "@/components/ui/close-button"
import { printCvPage } from "@/lib/cv/print-cv"
import { masterFilename } from "@/lib/cv/download-master"

// Master CV has no per-job hidden items — every section renders.
const NO_HIDDEN: Set<string> = new Set()

interface MasterCVHeroProps {
  baseline: CVVersion | null
  profile: UserProfile | null
  open: boolean
  onOpen: () => void
  onReplace: () => void
}

interface MasterCVPanelProps {
  token: string
  baseline: CVVersion | null
  cv: CVStructured | null
  profile: UserProfile | null
  onClose: () => void
  onReplace: () => void
}

function masterDisplayName(profile: UserProfile | null): string {
  return profile?.full_name?.trim() || "Your Name"
}

function masterContact(cv: CVStructured | null, profile: UserProfile | null) {
  return {
    name: masterDisplayName(profile),
    title: cv?.experience[0]?.role || profile?.target_roles?.[0] || "",
    location: profile?.target_location ?? "",
    email: profile?.email ?? "",
    phone: "",
    linkedin: profile?.linkedin_url ?? "",
  }
}

export function MasterCVHero({ baseline, profile, open, onOpen, onReplace }: MasterCVHeroProps) {
  const vNum = baseline ? `v${baseline.user_version_number}` : "v0"
  const updatedAgo = baseline ? timeAgoShort(baseline.created_at) : "—"
  const displayName = masterDisplayName(profile)
  const previewLines = [78, 92, 64, 88, 70, 95, 82, 60]

  return (
    <div className="tm-lib-master-card">
      <div className="tm-lib-master-preview">
        <div className="tm-lib-master-preview-name">{displayName.split(" ")[0].toUpperCase()}</div>
        {previewLines.map((w, i) => (
          <div key={i} className="tm-lib-master-preview-line" style={{
            height: i === 0 ? 6 : 3,
            width: `${w}%`,
            background: i === 0 ? "var(--tm-text-muted)" : "var(--tm-border-soft)",
          }}/>
        ))}
        <div className="tm-lib-master-aperture">
          <ApertureMark size={10}/>
        </div>
      </div>

      <div className="tm-lib-master-body">
        <div className="tm-lib-master-header">
          <div style={{ minWidth: 0 }}>
            <div className="tm-lib-eyebrow" style={{ color: "var(--tm-interactive)" }}>
              MAIN CV · SOURCE OF TRUTH
            </div>
            <div className="tm-lib-master-name">{displayName}</div>
            <div className="tm-lib-master-role">
              {(profile?.target_roles?.[0]) ?? "Senior Product Manager"}
              {profile?.target_location ? ` · ${profile.target_location}` : ""}
            </div>
          </div>
          <span className="tm-lib-master-version">{vNum}</span>
        </div>

        <div className="tm-lib-master-stats">
          {baseline ? (
            <span>updated <span className="tm-lib-master-stats-val tm-lib-mono">{updatedAgo}</span> ago</span>
          ) : (
            <span style={{ color: "var(--tm-text-faint)" }}>No CV uploaded yet</span>
          )}
        </div>

        <div className="tm-lib-master-actions">
          <button
            type="button"
            className={`tm-lib-btn sm ${open ? "ghost" : "primary"}`}
            onClick={onOpen}
            disabled={!baseline}
            aria-pressed={open}
          >
            <LIcon d={open ? I.close : I.file} size={13}/> {open ? "Close Master CV" : "Open Master CV"}
          </button>
          <button type="button" className="tm-lib-btn ghost sm" onClick={onReplace}>
            <LIcon d={I.upload} size={13}/> Replace upload
          </button>
        </div>
      </div>
    </div>
  )
}

export function MasterCVPanel({
  token, baseline, cv, profile, onClose, onReplace,
}: MasterCVPanelProps) {
  const [editing, setEditing] = useState(false)
  const fallbackText = baseline?.body_text?.trim() ?? ""
  const canEdit = !!baseline && !!cv

  return (
    <section className="tm-lib-master-panel tm-lib-fade-in" aria-label="Master CV preview">
      <div className="tm-lib-master-panel-head">
        <div style={{ minWidth: 0 }}>
          <div className="tm-lib-eyebrow">{editing ? "EDITING MASTER CV" : "MASTER CV"}</div>
          <div className="tm-lib-master-panel-title">
            {masterDisplayName(profile)}
            {baseline && <span className="tm-lib-master-version">v{baseline.user_version_number}</span>}
          </div>
        </div>
        <div className="tm-lib-master-panel-actions">
          {editing ? (
            <button type="button" className="tm-lib-btn primary sm" onClick={() => setEditing(false)}>
              <LIcon d={I.file} size={12}/> Done
            </button>
          ) : (
            <>
              <button type="button" className="tm-lib-btn sm" onClick={() => setEditing(true)} disabled={!canEdit}>
                <LIcon d={I.edit ?? I.file} size={12}/> Edit
              </button>
              {cv ? (
                // WYSIWYG: print the .cvb-pdf-page shown below — exactly what downloads.
                <button
                  type="button"
                  className="tm-lib-btn primary sm"
                  onClick={() => printCvPage(masterFilename(profile?.full_name))}
                >
                  <LIcon d={I.file} size={12}/> Download Master
                </button>
              ) : (
                // No structured CV yet — fall back to the text-based download path.
                <DownloadCVButton
                  token={token}
                  baseline={baseline}
                  cv={cv}
                  fullName={profile?.full_name}
                  className="tm-lib-btn primary sm"
                  label="Download Master"
                />
              )}
              <button type="button" className="tm-lib-btn sm" onClick={onReplace}>
                <LIcon d={I.upload} size={12}/> Replace
              </button>
            </>
          )}
          <CloseButton onClick={onClose} ariaLabel="Close master CV preview" size={15}/>
        </div>
      </div>

      <div className="tm-lib-master-panel-body">
        {editing ? (
          <MasterEditor token={token} profile={profile}/>
        ) : cv ? (
          <div className="tm-lib-master-cv-stage">
            <PdfPage cv={cv} hidden={NO_HIDDEN} contact={masterContact(cv, profile)}/>
          </div>
        ) : (
          <pre className="tm-lib-master-panel-text">
            {fallbackText || "Your structured CV is still loading — the download below still works."}
          </pre>
        )}
      </div>
    </section>
  )
}
