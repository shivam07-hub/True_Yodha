"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { CVStructured, UserProfile } from "@/lib/api"
import { runAtsChecks } from "@/components/cv/builder/ats-checks"
import { Icon, type IconName } from "@/components/cv/builder/icons"
import { Button } from "@/components/ui/button"
import { stripCopiedMarkers } from "@/lib/cv/list-markers"
import { jobDraftKey, type SaveStatus } from "@/lib/cv-autosave"
import { useJobDraftAutosave } from "@/lib/hooks/use-job-draft-autosave"
import { useMasterAutosave } from "@/lib/hooks/use-master-autosave"
import { MobileCVSectionEditor } from "./mobile-cv-sections"
import { useSectionTitle } from "@/components/cv/section-titles-provider"
import type { SectionKey } from "@/lib/cv/section-order"
import { MobileDocumentPreview } from "./mobile-document-preview"
import {
  previewContact,
  sectionSummary,
  type MobileCVSection,
  withContact,
} from "./mobile-cv-model"

const SESSION_SECTION_KEY = "myro-mobile-cv-section-v1"

/** The mobile tab that edits each CV section; its label is the person's heading. */
const HEADING_KEY: Partial<Record<MobileCVSection, SectionKey>> = {
  summary: "summary",
  experience: "experience",
  projects: "projects",
  skills: "skills_line",
  education: "education",
  certifications: "certs",
}

const SECTIONS: { key: MobileCVSection; label: string; icon: IconName }[] = [
  { key: "contact", label: "Contact", icon: "target" },
  { key: "summary", label: "Summary", icon: "file" },
  { key: "experience", label: "Experience", icon: "tracker" },
  { key: "projects", label: "Projects", icon: "folder" },
  { key: "skills", label: "Skills", icon: "skills" },
  { key: "education", label: "Education", icon: "diamond" },
  { key: "certifications", label: "Certifications", icon: "check" },
]

interface MobileMainEditorProps {
  token: string
  profile: UserProfile | null
  onClose: () => void
  initialSection?: MobileCVSection | null
  cv: CVStructured
  /** Set when the open CV is a job document. Edits then save there, not on the Main CV. */
  job?: { jobId: string; save: (cv: CVStructured) => Promise<void> }
}

export function MobileMainEditor(props: MobileMainEditorProps) {
  if (props.job) return <MobileJobEditor {...props} job={props.job} />
  return <MobileMasterEditor {...props} />
}

function userKeyOf(profile: UserProfile | null): string {
  return profile?.ninja_name?.trim() || profile?.email?.trim() || "anon"
}

function MobileJobEditor({ token, profile, onClose, initialSection = null, cv: seed, job }: MobileMainEditorProps & { job: { jobId: string; save: (cv: CVStructured) => Promise<void> } }) {
  const autosave = useJobDraftAutosave({
    enabled: true,
    seed,
    draftKey: jobDraftKey(userKeyOf(profile), job.jobId),
    save: job.save,
  })
  return (
    <MobileEditorFrame
      token={token}
      profile={profile}
      onClose={onClose}
      initialSection={initialSection}
      seed={seed}
      heading="Edit CV"
      sectionStorageKey={`${SESSION_SECTION_KEY}:${job.jobId}`}
      draft={autosave.draft}
      status={autosave.status}
      recomputePending={false}
      update={autosave.update}
      saveNow={() => { void autosave.saveNow() }}
    />
  )
}

function MobileMasterEditor({ token, profile, onClose, initialSection = null, cv: seed }: MobileMainEditorProps) {
  const autosave = useMasterAutosave({
    token,
    enabled: true,
    userKey: userKeyOf(profile),
    seed,
  })
  return (
    <MobileEditorFrame
      token={token}
      profile={profile}
      onClose={onClose}
      initialSection={initialSection}
      seed={seed}
      heading="Edit Main CV"
      draft={autosave.draft}
      status={autosave.status}
      recomputePending={autosave.recomputePending}
      update={autosave.update}
      saveNow={autosave.saveNow}
    />
  )
}

function MobileEditorFrame({
  token, profile, onClose, initialSection = null, seed, heading, sectionStorageKey = SESSION_SECTION_KEY,
  draft, status, recomputePending, update, saveNow,
}: {
  token: string
  profile: UserProfile | null
  onClose: () => void
  initialSection?: MobileCVSection | null
  seed: CVStructured
  heading: string
  sectionStorageKey?: string
  draft: CVStructured | null
  status: SaveStatus
  recomputePending: boolean
  update: (cv: CVStructured) => void
  saveNow: () => void
}) {
  const [section, setSection] = useState<MobileCVSection | null>(initialSection)
  const [preview, setPreview] = useState(false)
  const title = useSectionTitle()

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(sectionStorageKey)
      if (!initialSection && SECTIONS.some(item => item.key === stored)) setSection(stored as MobileCVSection)
    } catch { /* blocked */ }
  }, [initialSection, sectionStorageKey])

  function openSection(next: MobileCVSection | null) {
    setSection(next)
    try {
      if (next) sessionStorage.setItem(sectionStorageKey, next)
      else sessionStorage.removeItem(sectionStorageKey)
    } catch { /* blocked */ }
  }

  function finish() {
    saveNow()
    try { sessionStorage.removeItem(sectionStorageKey) } catch { /* blocked */ }
    onClose()
  }

  const paper = draft ?? seed
  if (!paper) return null

  const cv = withContact(paper)
  const copiedMarks = runAtsChecks(cv, profile, "cv.pdf").find(
    (check) => check.apply === stripCopiedMarkers && !check.pass,
  )
  const labelOf = (item: (typeof SECTIONS)[number]) => {
    const heading = HEADING_KEY[item.key]
    return heading ? title(heading) : item.label
  }
  const active = SECTIONS.find(item => item.key === section)
  const activeLabel = active ? labelOf(active) : heading
  const saveLabel = status === "error"
    ? "Couldn’t save"
    : status === "saving"
      ? "Saving…"
      : recomputePending
        ? "Saved · updating score"
        : "Saved"

  if (preview) {
    return (
      <FocusPortal>
        <div className="tm-mcv-focus tm-mcv-full-preview" role="dialog" aria-modal="true" aria-label="CV preview">
          <FocusHeader title="Preview" onBack={() => setPreview(false)} status={saveLabel} />
          <main className="tm-mcv-focus-body">
            <MobileDocumentPreview cv={cv} contact={previewContact(cv, profile)} />
          </main>
        </div>
      </FocusPortal>
    )
  }

  return (
    <FocusPortal>
    <div className="tm-mcv-focus" role="dialog" aria-modal="true" aria-label={activeLabel}>
      <FocusHeader
        title={activeLabel}
        status={saveLabel}
        onBack={() => section ? openSection(null) : finish()}
        error={status === "error"}
      />

      <main className="tm-mcv-focus-body">
        {section ? (
          <MobileCVSectionEditor
            token={token}
            section={section}
            cv={cv}
            accountEmail={profile?.email}
            onChange={update}
          />
        ) : (
          <nav className="tm-mcv-section-list" aria-label="CV sections">
            {copiedMarks?.apply ? (
              <div className="tm-mcv-marker-fix">
                <p>
                  <strong>{copiedMarks.detail}</strong>
                  <small>ats · layout</small>
                </p>
                <Button type="button" size="lg" onClick={() => update(copiedMarks.apply!(cv))}>
                  Fix all
                </Button>
              </div>
            ) : null}
            {SECTIONS.map(item => {
              const missingPhone = item.key === "contact" && !cv.contact?.phone.trim()
              return (
                <button type="button" key={item.key} onClick={() => openSection(item.key)}>
                  <span className="tm-mcv-section-icon"><Icon name={item.icon} size={22} /></span>
                  <span className="tm-mcv-section-copy">
                    <strong>{labelOf(item)}</strong>
                    <small className={missingPhone ? "is-warning" : ""}>
                      {missingPhone ? "Add a phone number" : sectionSummary(item.key, cv)}
                    </small>
                  </span>
                  <Icon name="chevron-right" size={20} aria-hidden="true" />
                </button>
              )
            })}
          </nav>
        )}
      </main>

      <footer className="tm-mcv-focus-actions">
        <Button type="button" variant="outline" size="lg" onClick={() => setPreview(true)}>
          <Icon name="eye" /> Preview
        </Button>
        <Button type="button" size="lg" onClick={section ? () => openSection(null) : finish}>
          {section ? "Sections" : "Done"}
        </Button>
      </footer>
    </div>
    </FocusPortal>
  )
}

// The authed shell's scroll container keeps a lingering `transform` from
// `.tm-page-enter` (animation fill-mode: forwards), which makes it the
// containing block for any descendant position:fixed — trapping this overlay
// between the global top bar and bottom nav, so its own back button and Done
// footer were unreachable. Portaling to <body> escapes that transformed
// ancestor so `.tm-mcv-focus` is viewport-anchored (same fix as the job-detail
// drawer; see globals.css ~L41). `.tm-mcv-focus` uses global --tm-* tokens, so
// no scope class is needed outside the component tree.
function FocusPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return createPortal(children, document.body)
}

function FocusHeader({ title, status, onBack, error = false }: { title: string; status: string; onBack: () => void; error?: boolean }) {
  return (
    <header className="tm-mcv-focus-head">
      <Button type="button" variant="ghost" size="icon-md" aria-label="Go back" onClick={onBack}>
        <Icon name="chevron-right" size={22} style={{ transform: "rotate(180deg)" }} />
      </Button>
      <h2>{title}</h2>
      <span className={error ? "is-error" : ""} role="status" aria-live="polite">
        <i aria-hidden="true" /> {status}
      </span>
    </header>
  )
}
