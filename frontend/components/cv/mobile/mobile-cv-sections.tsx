"use client"

import { useState } from "react"
import type { CVStructured } from "@/lib/api"
import { Icon } from "@/components/cv/builder/icons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { MobileBulletList } from "./mobile-bullet-list"
import { EMPTY_CONTACT, moveItem, type MobileCVSection } from "./mobile-cv-model"

interface Props {
  token: string
  section: MobileCVSection
  cv: CVStructured
  accountEmail?: string | null
  onChange: (cv: CVStructured) => void
}

export function MobileCVSectionEditor({ token, section, cv, accountEmail, onChange }: Props) {
  const patch = (mutate: (draft: CVStructured) => void) => {
    const draft = structuredClone(cv)
    mutate(draft)
    onChange(draft)
  }

  if (section === "contact") {
    const contact = { ...EMPTY_CONTACT, ...(cv.contact ?? {}) }
    const fields: { key: keyof typeof contact; label: string; type?: string }[] = [
      { key: "name", label: "Name" },
      { key: "title", label: "Professional headline" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "location", label: "Location" },
      { key: "linkedin", label: "LinkedIn", type: "url" },
    ]
    return (
      <div className="tm-mcv-fields">
        {fields.map(field => (
          <label className="tm-mcv-field" key={field.key}>
            <span>{field.label}</span>
            <input
              type={field.type ?? "text"}
              value={contact[field.key]}
              autoComplete={field.key === "name" ? "name" : field.key === "email" ? "email" : field.key === "phone" ? "tel" : "off"}
              onChange={event => patch(draft => {
                draft.contact = { ...EMPTY_CONTACT, ...(draft.contact ?? {}), [field.key]: event.target.value }
              })}
            />
          </label>
        ))}
        {!contact.email && accountEmail && (
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => patch(draft => {
              draft.contact = { ...EMPTY_CONTACT, ...(draft.contact ?? {}), email: accountEmail }
            })}
          >
            Use account email
          </Button>
        )}
      </div>
    )
  }

  if (section === "summary") {
    return (
      <label className="tm-mcv-field">
        <span>Summary</span>
        <textarea
          rows={8}
          value={cv.summary ?? ""}
          onChange={event => patch(draft => { draft.summary = event.target.value })}
        />
      </label>
    )
  }

  if (section === "skills") {
    return (
      <label className="tm-mcv-field">
        <span>Skills</span>
        <textarea
          rows={6}
          value={cv.skills_line ?? ""}
          placeholder="Product strategy, SQL, user research"
          onChange={event => patch(draft => { draft.skills_line = event.target.value })}
        />
      </label>
    )
  }

  if (section === "experience") {
    return (
      <EntryCollection
        label="role"
        count={cv.experience.length}
        onAdd={() => patch(draft => { draft.experience.push({ role: "", company: "", dates: "", location: "", bullets: [""] }) })}
      >
        {cv.experience.map((experience, index) => (
          <section className="tm-mcv-entry" key={`${experience.company}-${index}`}>
            <EntryHeader
              title={experience.role || `Role ${index + 1}`}
              index={index}
              count={cv.experience.length}
              onMove={direction => patch(draft => { draft.experience = moveItem(draft.experience, index, direction) })}
              onDelete={() => patch(draft => { draft.experience.splice(index, 1) })}
            />
            <div className="tm-mcv-fields tm-mcv-fields-grid">
              <TextField label="Role" value={experience.role} onChange={value => patch(draft => { draft.experience[index].role = value })} />
              <TextField label="Company" value={experience.company} onChange={value => patch(draft => { draft.experience[index].company = value })} />
              <TextField label="Dates" value={experience.dates} onChange={value => patch(draft => { draft.experience[index].dates = value })} />
              <TextField label="Location" value={experience.location} onChange={value => patch(draft => { draft.experience[index].location = value })} />
            </div>
            <MobileBulletList
              token={token}
              role={experience.role}
              bullets={experience.bullets}
              onChange={bullets => patch(draft => { draft.experience[index].bullets = bullets })}
            />
          </section>
        ))}
      </EntryCollection>
    )
  }

  if (section === "projects") {
    return (
      <EntryCollection
        label="project"
        count={cv.projects.length}
        onAdd={() => patch(draft => { draft.projects.push({ name: "", dates: "", bullets: [""] }) })}
      >
        {cv.projects.map((project, index) => (
          <section className="tm-mcv-entry" key={`${project.name}-${index}`}>
            <EntryHeader
              title={project.name || `Project ${index + 1}`}
              index={index}
              count={cv.projects.length}
              onMove={direction => patch(draft => { draft.projects = moveItem(draft.projects, index, direction) })}
              onDelete={() => patch(draft => { draft.projects.splice(index, 1) })}
            />
            <div className="tm-mcv-fields tm-mcv-fields-grid">
              <TextField label="Project name" value={project.name} onChange={value => patch(draft => { draft.projects[index].name = value })} />
              <TextField label="Dates" value={project.dates} onChange={value => patch(draft => { draft.projects[index].dates = value })} />
            </div>
            <MobileBulletList
              token={token}
              role={project.name}
              bullets={project.bullets}
              onChange={bullets => patch(draft => { draft.projects[index].bullets = bullets })}
            />
          </section>
        ))}
      </EntryCollection>
    )
  }

  if (section === "education") {
    return (
      <EntryCollection label="education" count={cv.education.length} onAdd={() => patch(draft => {
        draft.education.push({ institution: "", degree: "", dates: "", grade: "", location: "" })
      })}>
        {cv.education.map((education, index) => (
          <section className="tm-mcv-entry" key={`${education.institution}-${index}`}>
            <EntryHeader
              title={education.institution || `Education ${index + 1}`}
              index={index}
              count={cv.education.length}
              onMove={direction => patch(draft => { draft.education = moveItem(draft.education, index, direction) })}
              onDelete={() => patch(draft => { draft.education.splice(index, 1) })}
            />
            <div className="tm-mcv-fields tm-mcv-fields-grid">
              <TextField label="Institution" value={education.institution} onChange={value => patch(draft => { draft.education[index].institution = value })} />
              <TextField label="Degree" value={education.degree} onChange={value => patch(draft => { draft.education[index].degree = value })} />
              <TextField label="Dates" value={education.dates} onChange={value => patch(draft => { draft.education[index].dates = value })} />
              <TextField label="Grade" value={education.grade} onChange={value => patch(draft => { draft.education[index].grade = value })} />
              <TextField label="Location" value={education.location} onChange={value => patch(draft => { draft.education[index].location = value })} />
            </div>
          </section>
        ))}
      </EntryCollection>
    )
  }

  return (
    <EntryCollection label="certification" count={cv.certs.length} onAdd={() => patch(draft => { draft.certs.push("") })}>
      {cv.certs.map((certification, index) => (
        <div className="tm-mcv-cert" key={`${certification}-${index}`}>
          <TextField label={`Certification ${index + 1}`} value={certification} onChange={value => patch(draft => { draft.certs[index] = value })} />
          <DeleteButton label={`certification ${index + 1}`} onDelete={() => patch(draft => { draft.certs.splice(index, 1) })} />
        </div>
      ))}
    </EntryCollection>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="tm-mcv-field"><span>{label}</span><input value={value} onChange={event => onChange(event.target.value)} /></label>
}

function EntryCollection({ label, count, onAdd, children }: { label: string; count: number; onAdd: () => void; children: React.ReactNode }) {
  return <div className="tm-mcv-collection">{children}<Button type="button" variant="ghost" size="md" onClick={onAdd}><Icon name="plus" /> Add {label}</Button>{count === 0 && <p className="tm-mcv-empty">Add your first {label}.</p>}</div>
}

function EntryHeader({ title, index, count, onMove, onDelete }: { title: string; index: number; count: number; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  return (
    <header className="tm-mcv-entry-head">
      <h3>{title}</h3>
      <div>
        <Button type="button" variant="ghost" size="icon-md" aria-label={`Move ${title} up`} disabled={index === 0} onClick={() => onMove(-1)}><Icon name="chevron-down" style={{ transform: "rotate(180deg)" }} /></Button>
        <Button type="button" variant="ghost" size="icon-md" aria-label={`Move ${title} down`} disabled={index === count - 1} onClick={() => onMove(1)}><Icon name="chevron-down" /></Button>
        <DeleteButton label={title} onDelete={onDelete} />
      </div>
    </header>
  )
}

function DeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-md"
        aria-label={`Delete ${label}`}
        onClick={() => setOpen(true)}
      >
        <Icon name="trash" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Delete {label}?</DialogTitle>
          <DialogDescription>This removes it from the current CV draft.</DialogDescription>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => { onDelete(); setOpen(false) }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
