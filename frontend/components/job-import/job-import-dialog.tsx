"use client"

import { useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { APPLICATION_STAGES, type ApplicationStatus } from "@/lib/api"
import { pastedLink } from "@/lib/job-import/pasted-link"
import { EXTENSION_WEBSTORE_URL } from "@/lib/extension"
import { useJobImport } from "@/lib/job-import/use-job-import"
import { STAGE_LABEL, type StageKey } from "@/components/cv/pipeline/useTrackerBoard"

export const ADD_JOB_LABEL = "Add a job"

const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: "var(--tm-radius-sm)",
  background: "var(--tm-surface-2)",
  border: "1px solid var(--tm-border)",
  color: "var(--tm-text)",
  fontSize: "var(--tm-fs-body)",
  fontFamily: "inherit",
  outline: "none",
}

/**
 * Web skin for the job-import model. Fetching lives in `useJobImport`.
 * Collections mounts this through `useManualAdd`.
 */
export function JobImportDialog({
  token,
  onClose,
  onImported,
}: {
  token: string
  onClose: () => void
  onImported: (jobId: string) => void
}) {
  const importJob = useJobImport(token)
  const { state } = importJob
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState("")
  const [status, setStatus] = useState<ApplicationStatus>("saved")

  const busy = state.step === "extracting" || state.step === "importing"
  const draft = state.step === "review" || state.step === "importing" ? state : null
  const listing = state.step === "review" && state.listing

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent style={{ maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle>{ADD_JOB_LABEL}</DialogTitle>
          <DialogDescription>
            {listing
              ? "The listing at this link."
              : draft
                ? "Check the role before it is saved. A link sometimes comes back as the page tagline."
                : "Paste a link, a file, or the description."}
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <a href={EXTENSION_WEBSTORE_URL} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--tm-fs-caption)", color: "var(--tm-interactive)" }}>
              Save from any site with the Chrome extension
            </a>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPaste={(e) => {
                  const link = pastedLink(e.clipboardData.getData("text"))
                  if (!link || busy) return
                  e.preventDefault()
                  setUrl(link)
                  void importJob.submitLink(link)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && url.trim() && !busy) void importJob.submitLink(url)
                }}
                placeholder="https://… job posting link"
                aria-label="Job posting link"
                style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
              />
              <Button type="button" variant="neutral" size="sm" disabled={busy || !url.trim()} onClick={() => void importJob.submitLink(url)}>
                {state.step === "extracting" ? "Reading…" : "Fetch"}
              </Button>
            </div>
            <Button type="button" variant="neutral" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {state.step === "extracting" ? "Reading…" : "Upload a PDF, Word doc, or screenshot"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importJob.submitFile(file)
                e.target.value = ""
              }}
              style={{ display: "none" }}
            />
            <button type="button" onClick={importJob.pasteInstead} style={textButton}>
              Paste the description instead
            </button>
          </div>
        ) : (
          <Review
            role={draft.role}
            company={draft.company}
            jd={draft.jd}
            location={draft.location}
            locked={listing}
            onChange={importJob.updateReview}
          />
        )}

        {state.step === "failed" ? (
          <p style={{ margin: 0, fontSize: "var(--tm-fs-caption)", color: "var(--tm-danger)" }}>{state.reason}</p>
        ) : null}
        {state.step === "failed" && !state.canPasteInstead ? (
          <Button type="button" variant="neutral" size="sm" onClick={importJob.retry}>Try again</Button>
        ) : null}

        {draft ? (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Where are you with this?">
              {APPLICATION_STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  aria-pressed={status === stage}
                  onClick={() => setStatus(stage)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "var(--tm-radius-sm)",
                    fontSize: "var(--tm-fs-caption)",
                    fontFamily: "inherit",
                    cursor: "pointer",
                    background: status === stage ? "var(--tm-interactive)" : "transparent",
                    border: status === stage ? "1px solid var(--tm-interactive)" : "1px solid var(--tm-border)",
                    color: status === stage ? "var(--tm-interactive-fg)" : "var(--tm-text)",
                  }}
                >
                  {STAGE_LABEL[stage as StageKey]}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button type="button" variant="neutral" size="sm" onClick={importJob.reset}>Back</Button>
              <Button
                type="button"
                variant="solid"
                size="sm"
                disabled={busy || !draft.role.trim() || !draft.jd.trim()}
                onClick={() => void importJob.confirm(status).then((saved) => { if (saved) onImported(saved.jobId) })}
              >
                {state.step === "importing" ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Review({
  role, company, jd, location, locked, onChange,
}: {
  role: string
  company: string
  jd: string
  location: string
  /** A listing Myro holds: its fields are the listing's. */
  locked: boolean
  onChange: (patch: { role?: string; company?: string; jd?: string; location?: string }) => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={labelStyle}>
        Role
        <input value={role} readOnly={locked} onChange={(e) => onChange({ role: e.target.value })} style={fieldStyle} />
      </label>
      <label style={labelStyle}>
        Company
        <input value={company} readOnly={locked} onChange={(e) => onChange({ company: e.target.value })} style={fieldStyle} />
      </label>
      <label style={labelStyle}>
        Location
        <input value={location} readOnly={locked} onChange={(e) => onChange({ location: e.target.value })} style={fieldStyle} />
      </label>
      <label style={labelStyle}>
        Job description
        <textarea value={jd} readOnly={locked} onChange={(e) => onChange({ jd: e.target.value })} rows={6} style={{ ...fieldStyle, resize: "vertical" }} />
      </label>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: "var(--tm-fs-caption)",
  color: "var(--tm-text-muted)",
}

const textButton: React.CSSProperties = {
  alignSelf: "flex-start",
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--tm-text-muted)",
  fontSize: "var(--tm-fs-caption)",
  fontFamily: "inherit",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 3,
}
