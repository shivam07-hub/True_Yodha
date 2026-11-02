"use client"

import type { CVStructured, UserProfile } from "@/lib/api"
import { CvCommandBar } from "./cv-command-bar"
import { CVExportView } from "./cv-export-view"
import type { PdfPageContact } from "./pdf-page"

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
  sectionOrder?: string[] | null
  onBulletClick: (id: string, text: string) => void
  selectedBulletId: string | null
  onEditInPlayground: (jobId: string) => void
}

/** The tailored-CV twin of MasterCVPanel — same quiet sheet, same command bar
 *  (Edit across the paper, Download for PDF and DOCX). Edit opens the tailor. */
export function TailoredCVPanel({
  token, structured, hidden, contact, profile, versionId, footerMarkHidden,
  company, jobTitle, jobId, matchScore, appliedAt, sectionOrder,
  onBulletClick, selectedBulletId, onEditInPlayground,
}: TailoredCVPanelProps) {
  return (
    <section className="tm-lib-master-panel tm-lib-master-panel--quiet tm-lib-fade-in" aria-label="Tailored CV preview">
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
          sectionOrder={sectionOrder}
          company={company || undefined}
          jobTitle={jobTitle || undefined}
          jobId={jobId}
          matchScore={matchScore}
          appliedAt={appliedAt}
          onBulletClick={onBulletClick}
          selectedBulletId={selectedBulletId}
          paperOnly
          command={(actions) => (
            <CvCommandBar
              title={jobTitle || company || "Tailored CV"}
              detail={jobTitle && company ? company : undefined}
              onEdit={() => onEditInPlayground(jobId)}
              actions={actions}
            />
          )}
        />
      </div>
    </section>
  )
}
