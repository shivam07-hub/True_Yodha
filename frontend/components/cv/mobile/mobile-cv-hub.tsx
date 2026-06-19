"use client"

import { useMemo, useState } from "react"
import type { ApplicationResponse, CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { CVExportView } from "@/components/cv/builder/cv-export-view"
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
  versions: CVVersion[]
  currentBaseline: CVVersion | null
  applications: ApplicationResponse[]
  profile: UserProfile | null
  onOpenJob: (jobId: string) => void
  onReplaceCV: () => void
}

interface VersionGroup {
  jobId: string
  company: string
  role: string
  versions: CVVersion[]
  application: ApplicationResponse | null
}

export function MobileCVHub({
  token,
  cv: rawCv,
  versions,
  currentBaseline,
  applications,
  profile,
  onOpenJob,
  onReplaceCV,
}: Props) {
  const cv = withContact(rawCv)
  const [mode, setMode] = useState<"hub" | "edit" | "export">("hub")
  const [editorSection, setEditorSection] = useState<MobileCVSection | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const groups = useMemo(() => groupVersions(versions, applications), [versions, applications])
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
        hidden={new Set()}
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
          <p>Main CV and every tailored version</p>
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

      <section className="tm-mcv-library" aria-labelledby="tm-mcv-library-title">
        <h2 id="tm-mcv-library-title">Your CVs</h2>
        {groups.length === 0 ? (
          <div className="tm-mcv-library-empty">
            <p>No tailored CVs yet.</p>
            <Button type="button" variant="outline" size="md" onClick={() => window.location.assign("/market")}>Find a job</Button>
          </div>
        ) : groups.map(group => (
          <details className="tm-mcv-version-group" key={group.jobId}>
            <summary>
              <span>
                <strong>{group.role} · {group.company}</strong>
                <small>{applicationLabel(group.application)} · {group.versions.length} {group.versions.length === 1 ? "version" : "versions"}</small>
              </span>
              <Icon name="chevron-down" size={18} />
            </summary>
            <div className="tm-mcv-version-list">
              {group.versions.map((version, index) => (
                <button type="button" key={version.id} onClick={() => onOpenJob(group.jobId)}>
                  <span className={index === 0 ? "is-active" : ""} aria-hidden="true" />
                  <span>
                    <strong>{index === 0 ? "Active tailored CV" : versionKind(version)}</strong>
                    <small>{timeAgo(version.created_at)}{version.title ? ` · ${version.title}` : ""}</small>
                  </span>
                  <Icon name="chevron-right" size={18} />
                </button>
              ))}
            </div>
          </details>
        ))}
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

function groupVersions(versions: CVVersion[], applications: ApplicationResponse[]): VersionGroup[] {
  const applicationsByJob = new Map(applications.map(application => [application.job_id, application]))
  const byJob = new Map<string, CVVersion[]>()
  versions.filter(version => version.kind !== "baseline_upload" && version.job_id).forEach(version => {
    const jobId = version.job_id!
    byJob.set(jobId, [...(byJob.get(jobId) ?? []), version])
  })
  return Array.from(byJob, ([jobId, rows]) => {
    const sorted = rows.sort((a, b) => b.user_version_number - a.user_version_number)
    const latest = sorted[0]
    const application = applicationsByJob.get(jobId) ?? null
    return {
      jobId,
      company: latest.company_name || application?.company || "Company",
      role: latest.job_title || application?.title || "Tailored CV",
      versions: sorted,
      application,
    }
  }).sort((a, b) => Date.parse(b.versions[0].created_at) - Date.parse(a.versions[0].created_at))
}

function applicationLabel(application: ApplicationResponse | null): string {
  if (!application || application.status === "saved") return "Saved"
  if (application.status === "applied") return "Applied"
  return application.status.replaceAll("_", " ")
}

function versionKind(version: CVVersion): string {
  if (version.kind === "polished") return "AI polished"
  if (version.kind === "edited") return "Edited version"
  return "Tailored version"
}
