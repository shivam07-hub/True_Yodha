"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { UserProfile } from "@/lib/api"
import { Icon, type IconName } from "@/components/cv/builder/icons"
import { Button } from "@/components/ui/button"
import { useMasterAutosave } from "@/lib/hooks/use-master-autosave"
import { MobileCVSectionEditor } from "./mobile-cv-sections"
import { MobileDocumentPreview } from "./mobile-document-preview"
import {
  previewContact,
  sectionSummary,
  type MobileCVSection,
  withContact,
} from "./mobile-cv-model"

const SESSION_SECTION_KEY = "myro-mobile-cv-section-v1"

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
}

export function MobileMainEditor({ token, profile, onClose, initialSection = null }: MobileMainEditorProps) {
  const { draft, ready, status, recomputePending, update, saveNow } = useMasterAutosave({
    token,
    enabled: true,
    userKey: profile?.ninja_name?.trim() || profile?.email?.trim() || "anon",
  })
  const [section, setSection] = useState<MobileCVSection | null>(initialSection)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_SECTION_KEY)
      if (!initialSection && SECTIONS.some(item => item.key === stored)) setSection(stored as MobileCVSection)
    } catch { /* blocked */ }
  }, [initialSection])

  function openSection(next: MobileCVSection | null) {
    setSection(next)
    try {
      if (next) sessionStorage.setItem(SESSION_SECTION_KEY, next)
      else sessionStorage.removeItem(SESSION_SECTION_KEY)
    } catch { /* blocked */ }
  }

  function finish() {
    saveNow()
    try { sessionStorage.removeItem(SESSION_SECTION_KEY) } catch { /* blocked */ }
    onClose()
  }

  if (!ready || !draft) {
    return (
      <FocusPortal>
        <div className="tm-mcv-focus" role="dialog" aria-modal="true" aria-label="Edit Main CV">
          <div className="tm-mcv-loading" role="status">Loading your CV…</div>
        </div>
      </FocusPortal>
    )
  }

  const cv = withContact(draft)
  const activeLabel = SECTIONS.find(item => item.key === section)?.label ?? "Edit Main CV"
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
            {SECTIONS.map(item => {
              const missingPhone = item.key === "contact" && !cv.contact?.phone.trim()
              return (
                <button type="button" key={item.key} onClick={() => openSection(item.key)}>
                  <span className="tm-mcv-section-icon"><Icon name={item.icon} size={22} /></span>
                  <span className="tm-mcv-section-copy">
                    <strong>{item.label}</strong>
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
