"use client"

import { useState } from "react"
import { jobs as jobsApi } from "@/lib/api"
import { BottomSheet } from "./bottom-sheet"

/* ══════════════════════════════════════════════════════════════════════════
   AddJobSheet — paste-link → extract → import, with the JD-paste fallback the
   old dashboard's manual-add had (the link path's own error copy pointed at a
   "Upload a JD" door that didn't exist here — now it does).
   ══════════════════════════════════════════════════════════════════════════ */

export function AddJobSheet({ open, onClose, token, onAdded, snack, closeSnack, onTailor }: {
  open: boolean; onClose: () => void; token: string; onAdded: () => void
  snack: (s: { msg: string; action?: string; onAction?: () => void }) => void; closeSnack: () => void; onTailor: (jobId: string) => void
}) {
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [pasteMode, setPasteMode] = useState(false)
  const [jd, setJd] = useState("")
  const [role, setRole] = useState("")
  const [company, setCompany] = useState("")

  const finish = (jobId: string) => {
    setUrl(""); setJd(""); setRole(""); setCompany(""); setPasteMode(false)
    onClose()
    onAdded()
    snack({ msg: "Added to Collections", action: "Tailor now", onAction: () => { closeSnack(); onTailor(jobId) } })
  }

  const submitLink = async () => {
    const link = url.trim()
    if (!link || busy) return
    setBusy(true)
    try {
      const parsed = await jobsApi.extractUrl(token, link)
      const app = await jobsApi.importJob(token, {
        role_name: parsed.role || "Role from link",
        company_name: parsed.company || null,
        location: parsed.location || null,
        job_description: parsed.job_description || "",
        source_url: link,
        primary_skills: [],
        secondary_skills: [],
        status: "saved",
      })
      finish(app.job_id)
    } catch {
      setPasteMode(true)
      snack({ msg: "Couldn't read that link — paste the description instead" })
    } finally {
      setBusy(false)
    }
  }

  const submitPaste = async () => {
    const text = jd.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      const app = await jobsApi.importJob(token, {
        role_name: role.trim() || "Role from paste",
        company_name: company.trim() || null,
        location: null,
        job_description: text,
        source_url: url.trim() || null,
        primary_skills: [],
        secondary_skills: [],
        status: "saved",
      })
      finish(app.job_id)
    } catch {
      snack({ msg: "Couldn't save that — try again" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} label="Add job">
      <div style={{ padding: "0 18px 18px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>Add a job</div>
        <div style={{ fontSize: 12, color: "var(--mm-faint)", marginTop: 2 }}>Anything you add lands in Collections, ready to tailor.</div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a job link…" style={inputStyle} />
          {!pasteMode && (
            <button onClick={submitLink} disabled={busy} className="mm-press" style={{ ...btnStyle, opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Add"}</button>
          )}
        </div>

        {pasteMode ? (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role (optional)" style={{ ...inputStyle, flex: 1 }} />
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company (optional)" style={{ ...inputStyle, flex: 1 }} />
            </div>
            <textarea
              value={jd}
              onChange={e => setJd(e.target.value)}
              placeholder="Paste the job description…"
              rows={6}
              style={{ ...inputStyle, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.45 }}
            />
            <button onClick={submitPaste} disabled={busy || !jd.trim()} className="mm-press" style={{ ...btnStyle, opacity: busy || !jd.trim() ? 0.6 : 1 }}>
              {busy ? "…" : "Add to Collections"}
            </button>
          </div>
        ) : (
          <button onClick={() => setPasteMode(true)} style={{ marginTop: 10, background: "none", border: "none", padding: 0, color: "var(--mm-muted)", fontSize: 12, fontWeight: 650, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
            No link? Paste the description instead
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, border: "1px solid var(--mm-border)" }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: "var(--mm-raise-1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mm-text-3)" }}><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.4" /></svg></span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 650, color: "var(--mm-text)" }}>Chrome extension</span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--mm-faint)", marginTop: 1 }}>Save from any job board in one tap</span>
          </span>
        </div>
      </div>
    </BottomSheet>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, height: 40, borderRadius: 12, border: "1px solid var(--mm-border)", background: "var(--mm-inset)",
  color: "var(--mm-text)", padding: "0 12px", fontSize: 13.5, outline: "none", fontFamily: "inherit",
}
const btnStyle: React.CSSProperties = {
  height: 40, padding: "0 16px", borderRadius: 12, border: "none", background: "var(--mm-accent)",
  color: "var(--mm-accent-fg)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
}
