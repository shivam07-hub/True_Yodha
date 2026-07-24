"use client"

import type { CVStructured, UserProfile } from "@/lib/api"
import { CVExportView } from "./cv-export-view"
import type { PdfPageContact } from "./pdf-page"
import { I, LIcon } from "./library-icons"

interface TailoredCVPanelProps {
  token: string
  structured: CVStructured
  hidden: Set<string>
  contact: PdfPageContact
  profile: UserProfile | null
  versionId: number | null
  footerMarkHidden: boolean
  company: string
  jobTitle: string
  jobId: string
  matchScore: number
  appliedAt: string | null
  onBulletClick: (id: string, text: string) => void
  selectedBulletId: string | null
  onEditInPlayground: (jobId: string) => void
  onSwitchToMain: () => void
}

/** The tailored-CV twin of MasterCVPanel — same `.tm-lib-master-panel` head +
 *  body chrome (so a tailored copy reads as visually consistent with the
 *  Main CV, not a differently-shaped page bolted on), plus the one action a
 *  tailored copy actually needs: hop into the Tailor workspace to edit it. */
export function TailoredCVPanel({
  token, structured, hidden, contact, profile, versionId, footerMarkHidden,
  company, jobTitle, jobId, matchScore, appliedAt,
  onBulletClick, selectedBulletId, onEditInPlayground, onSwitchToMain,
}: TailoredCVPanelProps) {
  return (
    <section className="tm-lib-master-panel tm-lib-fade-in" aria-label="Tailored CV preview">
      <div className="tm-lib-master-panel-head">
        <div style={{ minWidth: 0 }}>
          <div className="tm-lib-eyebrow">TAILORED CV</div>
          <div className="tm-lib-master-panel-title">
            {jobTitle}{company ? ` · ${company}` : ""}
          </div>
        </div>
        <div className="tm-lib-master-panel-actions">
          <button type="button" className="tm-lib-btn sm" onClick={onSwitchToMain}>
            Switch to Main CV
          </button>
          <button type="button" className="tm-lib-btn primary sm" onClick={() => onEditInPlayground(jobId)}>
            <LIcon d={I.edit ?? I.file} size={12}/> Edit in Playground
          </button>
        </div>
      </div>
      <div className="tm-lib-master-panel-body">
        <CVExportView
          token={token}
          cv={structured}
          hidden={hidden}
          contact={contact}
          profile={profile}
          context="tailored"
          skin="inline"
          versionId={versionId}
          footerMarkHidden={footerMarkHidden}
          company={company || undefined}
          jobTitle={jobTitle || undefined}
          jobId={jobId}
          matchScore={matchScore}
          appliedAt={appliedAt}
          onBulletClick={onBulletClick}
          selectedBulletId={selectedBulletId}
        />
      </div>
    </section>
  )
}
