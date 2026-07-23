"use client"

import { useState } from "react"
import type { ApplicationResponse, CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { CVExportView } from "@/components/cv/builder/cv-export-view"
import { FinishTailoringLane } from "@/components/cv/builder/finish-tailoring-lane"
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
import { previewContact, type MobileCVSection, withContact } from "./mobile-cv-model"

interface Props {
  token: string
  cv: CVStructured
  currentBaseline: CVVersion | null
  profile: UserProfile | null
  applications: ApplicationResponse[]
  onOpenJob: (jobId: string) => void
  onReplaceCV: () => void
}

export function MobileCVHub({
  token,
  cv: rawCv,
  currentBaseline,
  profile,
  applications,
  onOpenJob,
  onReplaceCV,
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
        token={token}
        profile={profile}
        initialSection={editorSection}
        onClose={() => setMode("hub")}
      />
    )
  }

  if (mode === "export") {
    return (
      <CVExportView
        token={token}
        cv={cv}
        hidden={new Set(currentBaseline?.hidden_items ?? [])}
        contact={contact}
        profile={profile}
        context="master"
        versionId={currentBaseline?.id ?? null}
        footerMarkHidden={currentBaseline?.footer_mark_hidden ?? true}
        mobile
        onBack={() => setMode("hub")}
        onFixContact={() => openEditor("contact")}
      />
    )
  }

  return (
    <div className="tm-mcv-hub">
      <header className="tm-mcv-hub-head">
        <div>
          <h1>My CV</h1>
        </div>
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
      </header>

      <FinishTailoringLane applications={applications} onOpenJob={onOpenJob} />

      <section className="tm-mcv-main" aria-labelledby="tm-mcv-main-title">
        <header>
          <h2 id="tm-mcv-main-title"><Icon name="file" size={18} /> Main CV</h2>
          {currentBaseline && <span>Updated {timeAgo(currentBaseline.created_at)}</span>}
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
