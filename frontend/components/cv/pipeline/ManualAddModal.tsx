"use client"

import { useRef, useState } from "react"
import { jobs, APPLICATION_STAGES } from "@/lib/api"
import type { ApplicationResponse, ApplicationStatus } from "@/lib/api"
import { useXPStore } from "@/store/xpStore"
import { XP_POLICY } from "@/lib/xp-policy"
import { STAGE_LABEL } from "./useTrackerBoard"
import type { StageKey } from "./useTrackerBoard"

type PreviewResult = Awaited<ReturnType<typeof jobs.importPreview>>

interface Props {
  token: string
  onClose: () => void
  onSaved: (app: ApplicationResponse) => void
}

export function ManualAddModal({ token, onClose, onSaved }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [company, setCompany] = useState("")
  const [role, setRole] = useState("")
  const [location, setLocation] = useState("")
  const [url, setUrl] = useState("")
  const [jd, setJd] = useState("")
  const [status, setStatus] = useState<ApplicationStatus>("applied")
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [primarySel, setPrimarySel] = useState<Set<string>>(new Set())
  const [secondarySel, setSecondarySel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsedFrom, setParsedFrom] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const setBalance = useXPStore((s) => s.setBalance)

  async function handleFile(file: File) {
    setParsing(true); setError(null); setParsedFrom(null)
    try {
      const res = await jobs.extractFile(token, file)
      // Fill from the parse, but never clobber something the user already typed.
      if (res.company && !company.trim()) setCompany(res.company)
      if (res.role && !role.trim()) setRole(res.role)
      if (res.location && !location.trim()) setLocation(res.location)
      if (res.job_description) setJd((prev) => (prev.trim() ? prev : res.job_description))
      setParsedFrom(file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file")
    } finally {
      setParsing(false)
    }
  }

  function validate(): string | null {
    if (!company.trim()) return "Company is required"
    if (!role.trim()) return "Role is required"
    return null
  }

  async function handleExtract() {
    const v = validate()
    if (v) { setError(v); return }
    if (!jd.trim()) { setError("Paste a job description first, or use Skip skills"); return }
    setBusy(true); setError(null)
    try {
      const res = await jobs.importPreview(token, {
        role_name: role.trim(),
        company_name: company.trim() || null,
        location: location.trim() || null,
        source_url: url.trim() || null,
        job_description: jd.trim(),
      })
      setPreview(res)
      setPrimarySel(new Set(res.primary_skills.map(s => s.label)))
      setSecondarySel(new Set(res.secondary_skills.map(s => s.label)))
      setStep(2)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleSave(opts: { skipSkills?: boolean } = {}) {
    const v = validate()
    if (v) { setError(v); return }
    setBusy(true); setError(null)
    try {
      const app = await jobs.importJob(token, {
        role_name: role.trim(),
        company_name: company.trim() || null,
        location: location.trim() || null,
        source_url: url.trim() || null,
        source_platform: "manual_web",
        job_description: jd.trim() || "(no description)",
        primary_skills: opts.skipSkills ? [] : Array.from(primarySel),
        secondary_skills: opts.skipSkills ? [] : Array.from(secondarySel),
        status,
      })
      if (typeof app.xp_balance === "number") setBalance(app.xp_balance)
      onSaved(app)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,10,24,0.7)", backdropFilter: "blur(4px)", zIndex: 60 }} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 61, width: "min(560px, 94vw)", maxHeight: "90vh", overflowY: "auto",
          background: "var(--tm-surface)", border: "1px solid var(--tm-int-border)",
          borderRadius: 14, padding: 24,
          display: "flex", flexDirection: "column", gap: 14,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-interactive)" }}>
              {step === 1 ? "Add application" : "Confirm skills"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--tm-text)", marginTop: 4 }}>
              {step === 1 ? "Track a job from anywhere" : `${company || "Company"} — ${role}`}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)", color: "var(--tm-text-muted)", cursor: "pointer", display: "grid", placeItems: "center", fontSize: 14, fontFamily: "inherit" }}>✕</button>
        </div>

        {step === 1 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Company *">
                <Input value={company} onChange={setCompany} placeholder="Stripe" />
              </Field>
              <Field label="Role *">
                <Input value={role} onChange={setRole} placeholder="Senior Product Designer" />
              </Field>
              <Field label="Location">
                <Input value={location} onChange={setLocation} placeholder="Remote / Bengaluru" />
              </Field>
              <Field label="Posting URL">
                <Input value={url} onChange={setUrl} placeholder="https://…" />
              </Field>
            </div>
            <Field label="Job description (paste, or upload the posting)">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={parsing}
                style={{
                  width: "100%", boxSizing: "border-box", marginBottom: 8,
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8, cursor: parsing ? "wait" : "pointer",
                  background: "var(--tm-int-bg-wash, rgba(0,245,212,0.03))",
                  border: "1.5px dashed var(--tm-int-border, var(--tm-accent-ring))",
                  color: "var(--tm-text)", fontFamily: "inherit", textAlign: "left",
                }}
              >
                <span style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 6, color: "var(--tm-interactive)", border: "1px solid var(--tm-int-border, var(--tm-accent-ring))", flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v14M6 9l6-6 6 6M5 21h14" /></svg>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--tm-text)" }}>
                    {parsing ? "Reading the posting…" : parsedFrom ? `Loaded from ${parsedFrom}` : "Upload PDF, Word, or a screenshot"}
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--tm-text-muted)", marginTop: 2 }}>
                    {parsing ? "Extracting company, role & description" : `Myro fills the fields below · +${XP_POLICY.addJobReward} XP when you save`}
                  </span>
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = "" }}
                style={{ display: "none" }}
              />
              <textarea
                value={jd}
                onChange={e => setJd(e.target.value)}
                rows={6}
                placeholder="Paste the JD here — or upload the posting above. Myro will extract skills from it."
                style={textareaStyle}
              />
            </Field>
            <Field label="Where are you with this?">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {APPLICATION_STAGES.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    style={{
                      padding: "5px 12px", borderRadius: 99, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                      background: status === s ? "var(--tm-interactive)" : "rgba(255,255,255,0.03)",
                      border: status === s ? "1px solid var(--tm-interactive)" : "1px solid var(--tm-border)",
                      color: status === s ? "var(--tm-interactive-fg)" : "var(--tm-text-muted)",
                    }}
                  >
                    {STAGE_LABEL[s as StageKey]}
                  </button>
                ))}
              </div>
            </Field>
            {error && <div style={{ fontSize: 12, color: "var(--tm-danger)" }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={onClose} style={buttonGhostStyle}>Cancel</button>
              <button
                onClick={() => handleSave({ skipSkills: true })}
                disabled={busy}
                style={buttonOutlineStyle}
              >
                Skip skills &amp; save
              </button>
              <button
                onClick={handleExtract}
                disabled={busy}
                style={buttonPrimaryStyle}
              >
                {busy ? "…" : "Next: extract →"}
              </button>
            </div>
          </>
        )}

        {step === 2 && preview && (
          <>
            <SkillSection
              title="PRIMARY (in the role essentials)"
              skills={preview.primary_skills}
              selected={primarySel}
              onToggle={(label) => toggleSet(primarySel, label, setPrimarySel)}
            />
            <SkillSection
              title="SECONDARY (mentioned in JD)"
              skills={preview.secondary_skills}
              selected={secondarySel}
              onToggle={(label) => toggleSet(secondarySel, label, setSecondarySel)}
            />
            {preview.warnings.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--tm-warning)" }}>
                {preview.warnings.join(" · ")}
              </div>
            )}
            {error && <div style={{ fontSize: 12, color: "var(--tm-danger)" }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={() => setStep(1)} style={buttonGhostStyle}>← Back</button>
              <button onClick={() => handleSave()} disabled={busy} style={buttonPrimaryStyle}>
                {busy ? "Saving…" : "Add to tracker"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function toggleSet(current: Set<string>, label: string, setter: (s: Set<string>) => void) {
  const next = new Set(current)
  if (next.has(label)) next.delete(label); else next.add(label)
  setter(next)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", boxSizing: "border-box",
        padding: "8px 10px", borderRadius: 6,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--tm-border)",
        color: "var(--tm-text)", fontSize: 13, fontFamily: "inherit",
        outline: "none",
      }}
    />
  )
}

function SkillSection({
  title, skills, selected, onToggle,
}: {
  title: string
  skills: Array<{ label: string }>
  selected: Set<string>
  onToggle: (label: string) => void
}) {
  if (skills.length === 0) {
    return (
      <div>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: "var(--tm-text-faint)", fontStyle: "italic" }}>
          none detected
        </div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {skills.map(s => {
          const on = selected.has(s.label)
          return (
            <button
              key={s.label}
              onClick={() => onToggle(s.label)}
              style={{
                padding: "5px 10px", borderRadius: 99, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                background: on ? "var(--tm-int-bg-wash)" : "rgba(255,255,255,0.025)",
                border: `1px solid ${on ? "var(--tm-int-border)" : "var(--tm-border)"}`,
                color: on ? "var(--tm-interactive)" : "var(--tm-text-muted)",
              }}
            >
              {s.label} {on ? "✓" : "✗"}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const textareaStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--tm-border)", borderRadius: 6,
  padding: "8px 10px", fontSize: 13, color: "var(--tm-text)",
  fontFamily: "inherit", resize: "vertical", outline: "none",
}

const buttonGhostStyle: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8,
  background: "transparent", border: "1px solid var(--tm-border)",
  color: "var(--tm-text-muted)", cursor: "pointer",
  fontSize: 13, fontFamily: "inherit",
}

const buttonOutlineStyle: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8,
  background: "rgba(255,255,255,0.03)", border: "1px solid var(--tm-border)",
  color: "var(--tm-text)", cursor: "pointer",
  fontSize: 13, fontFamily: "inherit",
}

const buttonPrimaryStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8,
  background: "var(--tm-interactive)", border: "none",
  color: "var(--tm-interactive-fg)", cursor: "pointer",
  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
}
