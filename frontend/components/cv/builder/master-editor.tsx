/**
 * MasterEditor — living-master structured editor with autosave (PR-3).
 *
 * Edits the Main CV in place via useMasterAutosave: every change debounces a
 * PUT /cv/master (cheap mutate, no XP/LLM), shows saving/saved/error, recovers a
 * draft after refresh, and re-scores async (shimmer) without blocking typing.
 */
"use client"

import { useCallback, useState } from "react"
import type { CVContact, CVStructured } from "@/lib/api"
import type { MasterAutosaveState } from "@/lib/hooks/use-master-autosave"
import { EMPTY_CONTACT } from "../mobile/mobile-cv-model"
import { SkillsRefresh } from "./skills-refresh"
import "./master-editor.css"

interface MasterEditorProps {
  /** Autosave state owned by MasterCVPanel — the save indicator lives in the
      always-visible panel head, not inside this scrollable body. */
  autosave: MasterAutosaveState
  /** Needed for the free skills-refresh propose call (master surface). */
  token: string
}

export function MasterEditor({ autosave, token }: MasterEditorProps) {
  const { draft, ready, update } = autosave
  const [skillsRefreshOpen, setSkillsRefreshOpen] = useState(false)

  const patch = useCallback(
    (mut: (d: CVStructured) => CVStructured) => {
      if (!draft) return
      update(mut(structuredClone(draft)))
    },
    [draft, update],
  )

  if (!ready || !draft) {
    return <div className="tm-me-loading">Loading your CV…</div>
  }

  const contact: CVContact = { ...EMPTY_CONTACT, ...(draft.contact ?? {}) }
  const setContact = (key: keyof CVContact, value: string) =>
    patch((d) => ({ ...d, contact: { ...EMPTY_CONTACT, ...(d.contact ?? {}), [key]: value } }))

  return (
    <div className="tm-me">
      <Field label="Contact" id="cv-edit-contact">
        <div className="tm-me-contact-grid">
          <input className="tm-me-input" value={contact.name} placeholder="Full name"
            onChange={(e) => setContact("name", e.target.value)} />
          <input className="tm-me-input" value={contact.title} placeholder="Headline (e.g. GTM Manager)"
            onChange={(e) => setContact("title", e.target.value)} />
          <input className="tm-me-input" type="email" value={contact.email} placeholder="Email"
            onChange={(e) => setContact("email", e.target.value)} />
          <input className="tm-me-input" type="tel" value={contact.phone} placeholder="Phone (optional)"
            onChange={(e) => setContact("phone", e.target.value)} />
          <input className="tm-me-input" value={contact.location} placeholder="Location"
            onChange={(e) => setContact("location", e.target.value)} />
          <input className="tm-me-input" value={contact.linkedin} placeholder="LinkedIn URL"
            onChange={(e) => setContact("linkedin", e.target.value)} />
        </div>
      </Field>

      <Field label="Summary" id="cv-edit-summary">
        <textarea
          className="tm-me-textarea"
          rows={4}
          value={draft.summary ?? ""}
          onChange={(e) => patch((d) => ({ ...d, summary: e.target.value }))}
          placeholder="One short paragraph about who you are."
        />
      </Field>

      <Section id="cv-edit-experience" title="Experience" onAdd={() => patch((d) => ({
        ...d,
        experience: [...d.experience, { company: "", role: "", dates: "", location: "", bullets: [""] }],
      }))}>
        {draft.experience.map((exp, i) => (
          <div key={i} className="tm-me-entry">
            <div className="tm-me-entry-head">
              <input className="tm-me-input" value={exp.role} placeholder="Role"
                onChange={(e) => patch((d) => { d.experience[i].role = e.target.value; return d })}/>
              <input className="tm-me-input" value={exp.company} placeholder="Company"
                onChange={(e) => patch((d) => { d.experience[i].company = e.target.value; return d })}/>
              <button type="button" className="tm-me-del" aria-label="Remove role"
                onClick={() => patch((d) => { d.experience.splice(i, 1); return d })}>×</button>
            </div>
            <div className="tm-me-entry-meta">
              <input className="tm-me-input" value={exp.dates} placeholder="Dates"
                onChange={(e) => patch((d) => { d.experience[i].dates = e.target.value; return d })}/>
              <input className="tm-me-input" value={exp.location} placeholder="Location"
                onChange={(e) => patch((d) => { d.experience[i].location = e.target.value; return d })}/>
            </div>
            <BulletList
              bullets={exp.bullets}
              onChange={(j, v) => patch((d) => { d.experience[i].bullets[j] = v; return d })}
              onAdd={() => patch((d) => { d.experience[i].bullets.push(""); return d })}
              onRemove={(j) => patch((d) => { d.experience[i].bullets.splice(j, 1); return d })}
            />
          </div>
        ))}
      </Section>

      <Section title="Projects" onAdd={() => patch((d) => ({
        ...d, projects: [...d.projects, { name: "", dates: "", bullets: [""] }],
      }))}>
        {draft.projects.map((proj, i) => (
          <div key={i} className="tm-me-entry">
            <div className="tm-me-entry-head">
              <input className="tm-me-input" value={proj.name} placeholder="Project name"
                onChange={(e) => patch((d) => { d.projects[i].name = e.target.value; return d })}/>
              <input className="tm-me-input" value={proj.dates} placeholder="Dates"
                onChange={(e) => patch((d) => { d.projects[i].dates = e.target.value; return d })}/>
              <button type="button" className="tm-me-del" aria-label="Remove project"
                onClick={() => patch((d) => { d.projects.splice(i, 1); return d })}>×</button>
            </div>
            <BulletList
              bullets={proj.bullets}
              onChange={(j, v) => patch((d) => { d.projects[i].bullets[j] = v; return d })}
              onAdd={() => patch((d) => { d.projects[i].bullets.push(""); return d })}
              onRemove={(j) => patch((d) => { d.projects[i].bullets.splice(j, 1); return d })}
            />
          </div>
        ))}
      </Section>

      <Field
        label="Skills"
        id="cv-edit-skills"
        action={
          <button
            type="button"
            className="tm-me-refresh"
            onClick={() => setSkillsRefreshOpen(true)}
            title="Surface skills you’ve proven in Myro, ordered most-relevant first"
          >
            ✦ Refresh from proven skills
          </button>
        }
      >
        <textarea
          className="tm-me-textarea"
          rows={2}
          value={draft.skills_line ?? ""}
          onChange={(e) => patch((d) => ({ ...d, skills_line: e.target.value }))}
          placeholder="Comma-separated skills."
        />
      </Field>

      {skillsRefreshOpen && (
        <SkillsRefresh
          token={token}
          onKeep={(line) => patch((d) => ({ ...d, skills_line: line }))}
          onClose={() => setSkillsRefreshOpen(false)}
        />
      )}

      <Section title="Education" onAdd={() => patch((d) => ({
        ...d, education: [...d.education, { institution: "", degree: "", dates: "", grade: "", location: "" }],
      }))}>
        {draft.education.map((ed, i) => (
          <div key={i} className="tm-me-entry">
            <div className="tm-me-entry-head">
              <input className="tm-me-input" value={ed.institution} placeholder="Institution"
                onChange={(e) => patch((d) => { d.education[i].institution = e.target.value; return d })}/>
              <input className="tm-me-input" value={ed.degree} placeholder="Degree"
                onChange={(e) => patch((d) => { d.education[i].degree = e.target.value; return d })}/>
              <button type="button" className="tm-me-del" aria-label="Remove education"
                onClick={() => patch((d) => { d.education.splice(i, 1); return d })}>×</button>
            </div>
            <div className="tm-me-entry-meta">
              <input className="tm-me-input" value={ed.dates} placeholder="Dates"
                onChange={(e) => patch((d) => { d.education[i].dates = e.target.value; return d })}/>
              <input className="tm-me-input" value={ed.grade} placeholder="Grade"
                onChange={(e) => patch((d) => { d.education[i].grade = e.target.value; return d })}/>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Certifications" onAdd={() => patch((d) => ({ ...d, certs: [...d.certs, ""] }))}>
        {draft.certs.map((cert, i) => (
          <div key={i} className="tm-me-cert-row">
            <input className="tm-me-input" value={cert} placeholder="Certification"
              onChange={(e) => patch((d) => { d.certs[i] = e.target.value; return d })}/>
            <button type="button" className="tm-me-del" aria-label="Remove certification"
              onClick={() => patch((d) => { d.certs.splice(i, 1); return d })}>×</button>
          </div>
        ))}
      </Section>
    </div>
  )
}

/** Autosave indicator for the panel head — always visible, never inside the
    scrolling editor body (so it can't be overlaid by content). */
export function MasterSaveStatus({ status, recomputePending, onSaveNow }: {
  status: MasterAutosaveState["status"]
  recomputePending: boolean
  onSaveNow: () => void
}) {
  const label =
    status === "saving" ? "Saving…"
    : status === "error" ? "Couldn’t save"
    : recomputePending ? "Saved · re-scoring"
    : status === "saved" ? "Saved"
    : "All changes save automatically"
  return (
    <div className={`tm-lib-savestatus tm-lib-savestatus-${status}`} role="status" aria-live="polite">
      <span className="tm-lib-savestatus-dot" aria-hidden />
      <span className="tm-lib-savestatus-label">{label}</span>
      {status === "error" && (
        <button type="button" className="tm-lib-savestatus-retry" onClick={onSaveNow}>Retry now</button>
      )}
    </div>
  )
}

function Field({ label, children, id, action }: { label: string; children: React.ReactNode; id?: string; action?: React.ReactNode }) {
  return (
    <div className="tm-me-field" id={id}>
      <div className="tm-me-field-head">
        <div className="tm-me-field-label">{label}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Section({ title, onAdd, children, id }: { title: string; onAdd: () => void; children: React.ReactNode; id?: string }) {
  return (
    <div className="tm-me-section" id={id}>
      <div className="tm-me-section-head">
        <div className="tm-me-field-label">{title}</div>
        <button type="button" className="tm-me-add" onClick={onAdd}>+ Add</button>
      </div>
      {children}
    </div>
  )
}

function BulletList({ bullets, onChange, onAdd, onRemove }: {
  bullets: string[]
  onChange: (i: number, v: string) => void
  onAdd: () => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="tm-me-bullets">
      {bullets.map((b, j) => (
        <div key={j} className="tm-me-bullet-row">
          <textarea className="tm-me-textarea tm-me-bullet" rows={2} value={b}
            placeholder="Achievement or responsibility"
            onChange={(e) => onChange(j, e.target.value)}/>
          <button type="button" className="tm-me-del" aria-label="Remove bullet" onClick={() => onRemove(j)}>×</button>
        </div>
      ))}
      <button type="button" className="tm-me-add sm" onClick={onAdd}>+ Add bullet</button>
    </div>
  )
}
