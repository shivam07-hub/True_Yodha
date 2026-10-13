"use client"

import { useRef, useState } from "react"
import { EXTENSION_WEBSTORE_URL } from "@/lib/extension"
import { useJobImport } from "@/lib/job-import/use-job-import"
import { BottomSheet } from "./bottom-sheet"

/**
 * Phone skin for the job-import model. Same steps as the desktop dialog:
 * a link or a file is reviewed before it is saved, and a failed extract
 * offers the description instead.
 */
export function AddJobSheet({ open, onClose, token, onAdded, snack, closeSnack, onTailor }: {
  open: boolean
  onClose: () => void
  token: string
  onAdded: () => void
  snack: (s: { msg: string; action?: string; onAction?: () => void }) => void
  closeSnack: () => void
  onTailor: (jobId: string) => void
}) {
  const importJob = useJobImport(token)
  const { state } = importJob
  const [url, setUrl] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  function dismiss() {
    importJob.reset()
    setUrl("")
    onClose()
  }

  async function save() {
    const saved = await importJob.confirm()
    if (!saved) return
    importJob.reset()
    setUrl("")
    onClose()
    onAdded()
    snack({
      msg: "Added to Collections",
      action: "Tailor now",
      onAction: () => { closeSnack(); onTailor(saved.jobId) },
    })
  }

  const busy = state.step === "extracting" || state.step === "importing"
  const draft = state.step === "review" || state.step === "importing" ? state : null

  return (
    <BottomSheet open={open} onClose={dismiss} label="Add job">
      <div style={{ padding: "0 18px 18px" }}>
        <div style={{ fontSize: "var(--tm-fs-heading)", fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>Add a job</div>
        <div style={{ fontSize: "var(--tm-fs-caption)", color: "var(--mm-faint)", marginTop: 2 }}>Anything you add lands in Collections, ready to tailor.</div>

        {!draft ? (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a job link…" aria-label="Job posting link" style={inputStyle} />
              <button type="button" onClick={() => void importJob.submitLink(url)} disabled={busy || !url.trim()} aria-busy={busy || undefined} className="mm-press" style={btnStyle}>
                {state.step === "extracting" ? "Reading…" : "Fetch"}
              </button>
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} style={linkButton}>
              Upload a PDF, Word doc, or screenshot
            </button>
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
            <button type="button" onClick={importJob.pasteInstead} style={linkButton}>
              No link? Paste the description instead
            </button>
          </>
        ) : (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={draft.role} onChange={(e) => importJob.updateReview({ role: e.target.value })} placeholder="Role" aria-label="Role" style={inputStyle} />
            <input value={draft.company} onChange={(e) => importJob.updateReview({ company: e.target.value })} placeholder="Company" aria-label="Company" style={inputStyle} />
            <textarea
              value={draft.jd}
              onChange={(e) => importJob.updateReview({ jd: e.target.value })}
              placeholder="Paste the job description…"
              aria-label="Job description"
              rows={6}
              style={{ ...inputStyle, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.45 }}
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !draft.role.trim() || !draft.jd.trim()}
              aria-busy={busy || undefined}
              className="mm-press"
              style={{ ...btnStyle, opacity: !draft.role.trim() || !draft.jd.trim() ? 0.6 : 1 }}
            >
              {state.step === "importing" ? "Adding…" : "Add to Collections"}
            </button>
          </div>
        )}

        {state.step === "failed" ? (
          <p style={{ margin: "10px 0 0", fontSize: "var(--tm-fs-caption)", color: "var(--tm-danger)" }}>
            {state.reason}
            {state.canPasteInstead ? "" : " "}
          </p>
        ) : null}
        {state.step === "failed" && !state.canPasteInstead ? (
          <button type="button" onClick={importJob.retry} style={linkButton}>Try again</button>
        ) : null}

        <a href={EXTENSION_WEBSTORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", marginTop: 12, padding: "12px", borderRadius: 10, border: "1px solid var(--mm-border)", textDecoration: "none" }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: "var(--tm-fs-body)", fontWeight: 600, color: "var(--mm-text)" }}>Chrome extension</span>
            <span style={{ display: "block", fontSize: "var(--tm-fs-caption)", color: "var(--mm-faint)", marginTop: 1 }}>Save from any job board in one tap</span>
          </span>
        </a>
      </div>
    </BottomSheet>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, height: 40, borderRadius: 10, border: "1px solid var(--mm-border)", background: "var(--mm-inset)",
  color: "var(--mm-text)", padding: "0 12px", fontSize: "var(--tm-fs-body)", outline: "none", fontFamily: "inherit",
}
const btnStyle: React.CSSProperties = {
  height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: "var(--mm-accent)",
  color: "var(--mm-accent-fg)", fontSize: "var(--tm-fs-body)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
}
const linkButton: React.CSSProperties = {
  marginTop: 10, background: "none", border: "none", padding: 0, color: "var(--mm-muted)",
  fontSize: "var(--tm-fs-caption)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  textDecoration: "underline", textUnderlineOffset: 3, textAlign: "left",
}
