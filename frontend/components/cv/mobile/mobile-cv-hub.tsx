"use client"

import { useState } from "react"
import type { CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { CVExportView } from "@/components/cv/builder/cv-export-view"
import { FinishTailoringLane } from "@/components/cv/builder/finish-tailoring-lane"
import { ForwardPassPanel } from "@/components/cv/builder/forward-pass-panel"
import { Icon } from "@/components/cv/builder/icons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { timeAgo } from "@/lib/cv/version-format"
import { MobileDocumentPreview } from "./mobile-document-preview"
import { MobileMainEditor } from "./mobile-main-editor"
import { MobileCVHistory } from "./mobile-cv-history"
import type { OpenJobCv } from "@/lib/cv/open-document"
import { previewContact, type MobileCVSection, withContact } from "./mobile-cv-model"

interface Props {
  token: string
  cv: CVStructured
  currentBaseline: CVVersion | null
  profile: UserProfile | null
  onOpenJob: (jobId: string) => void
  onReplaceCV: () => void
  /** The tailored CV open on this phone. Edits and export use it, not the Main CV. */
  openJob?: OpenJobCv | null
  onCloseJob?: () => void
}

export function MobileCVHub({
  token,
  cv: rawCv,
  currentBaseline,
  profile,
  onOpenJob,
  onReplaceCV,
  openJob = null,
  onCloseJob,
}: Props) {
  const cv = withContact(rawCv)
  const [mode, setMode] = useState<"hub" | "edit" | "export">("hub")
  const [editorSection, setEditorSection] = useState<MobileCVSection | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const contact = previewContact(cv, profile)

  function openEditor(section: MobileCVSection | null = null) {
    setEditorSection(section)
    setMode("edit")
  }

  if (mode === "edit") {
    return (
      <MobileMainEditor
        key={openJob?.jobId ?? "master"}
        token={token}
        profile={profile}
        cv={cv}
        initialSection={editorSection}
        onClose={() => setMode("hub")}
        job={openJob ? { jobId: openJob.jobId, save: openJob.save } : undefined}
      />
    )
  }

  if (mode === "export") {
    return (
      <CVExportView
        token={token}
        cv={cv}
        hidden={new Set(openJob ? openJob.hiddenItems : (currentBaseline?.hidden_items ?? []))}
        contact={contact}
        profile={profile}
        context={openJob ? "tailored" : "master"}
        versionId={openJob ? (openJob.versionBelongsToJob ? openJob.versionId : null) : (currentBaseline?.id ?? null)}
        footerMarkHidden={openJob ? openJob.footerMarkHidden : (currentBaseline?.footer_mark_hidden ?? true)}
        sectionOrder={openJob?.sectionOrder}
        company={openJob?.company}
        jobTitle={openJob?.title}
        jobId={openJob?.jobId}
        mobile
        onBack={() => setMode("hub")}
        onFixContact={() => openEditor("contact")}
      />
    )
  }

  return (
    <div className="tm-mcv-hub">
      <header className="tm-mcv-hub-head">
        {openJob && onCloseJob ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-md"
            className="min-h-[44px] min-w-[44px]"
            aria-label="Back to your CVs"
            onClick={onCloseJob}
          >
            <Icon name="chevron-right" size={22} style={{ transform: "rotate(180deg)" }} />
          </Button>
        ) : null}
        <div>
          <h1>{openJob ? (openJob.company || openJob.title || "CV") : "My CV"}</h1>
        </div>
        {openJob ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-md"
            className="min-h-[44px] min-w-[44px]"
            aria-label="More CV actions"
            onClick={() => setMoreOpen(true)}
          >
            <Icon name="settings" />
          </Button>
        )}
      </header>

      {openJob ? null : <ForwardPassPanel token={token} />}

      <FinishTailoringLane token={token} onOpenJob={onOpenJob} />

      <section className="tm-mcv-main" aria-labelledby="tm-mcv-main-title">
        <header>
          <h2 id="tm-mcv-main-title"><Icon name="file" size={18} /> {openJob ? (openJob.title || "CV") : "Main CV"}</h2>
          {openJob ? null : currentBaseline && <span>Updated {timeAgo(currentBaseline.created_at)}</span>}
        </header>
        <button type="button" className="tm-mcv-preview-button" onClick={() => setMode("export")} aria-label="Open Main CV preview and export">
          <MobileDocumentPreview cv={cv} contact={contact} />
        </button>
        <div className="tm-mcv-hub-actions">
          <Button type="button" size="lg" onClick={() => openEditor()}><Icon name="edit" /> Edit CV</Button>
          <Button type="button" variant="outline" size="lg" onClick={() => setMode("export")}><Icon name="download" /> Export</Button>
        </div>
      </section>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Main CV actions</DialogTitle>
            <DialogDescription>Replacing creates a new Main CV. Existing tailored CVs remain in your library.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMoreOpen(false)}>Cancel</Button>
            <Button type="button" variant="outline" onClick={() => { setMoreOpen(false); setHistoryOpen(true) }}><Icon name="history" /> Version history</Button>
            <Button type="button" onClick={() => { setMoreOpen(false); onReplaceCV() }}><Icon name="upload" /> Replace Main CV</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileCVHistory token={token} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  )
}
