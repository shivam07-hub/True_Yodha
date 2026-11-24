"use client"

/**
 * The reviewer's editor for a LinkedIn check. Employers, titles and dates come
 * from the CV and stay read-only here (ADR-0016); the reviewer edits words.
 * List fields are edited as raw text and split only on delivery, so Enter
 * starts a new line instead of being trimmed away mid-typing.
 */

import type { LinkedInBlocks } from "@/lib/api"

export interface EditableBlocks {
  headline: string
  about: string
  experience: LinkedInBlocks["experience"]
  education: string
  skills: string
  featured: string
  delete: string
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean)

export function toEditable(blocks: LinkedInBlocks | null | undefined): EditableBlocks {
  return {
    headline: blocks?.headline ?? "",
    about: blocks?.about ?? "",
    experience: blocks?.experience ?? [],
    education: (blocks?.education ?? []).join("\n"),
    skills: (blocks?.skills ?? []).join("\n"),
    featured: blocks?.featured ?? "",
    delete: (blocks?.delete ?? []).join("\n"),
  }
}

export function toBlocks(e: EditableBlocks): LinkedInBlocks {
  return {
    headline: e.headline.trim(),
    about: e.about.trim(),
    experience: e.experience.map((r) => ({ ...r, text: r.text.trim() })),
    education: lines(e.education),
    skills: lines(e.skills),
    featured: e.featured.trim(),
    delete: lines(e.delete),
  }
}

function Area({
  label,
  value,
  onChange,
  rows = 3,
  limit,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  limit?: number
}) {
  return (
    <label className="rv-field">
      <span>
        {label}
        {limit ? <span className="rv-count"> {value.length}/{limit}</span> : null}
      </span>
      <textarea className="tm-input rv-area" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function BlocksEditor({ value, onChange }: { value: EditableBlocks; onChange: (next: EditableBlocks) => void }) {
  const set = (patch: Partial<EditableBlocks>) => onChange({ ...value, ...patch })
  return (
    <div className="rv-blocks">
      <Area label="Headline" value={value.headline} onChange={(headline) => set({ headline })} rows={2} limit={220} />
      <Area label="About" value={value.about} onChange={(about) => set({ about })} rows={10} limit={2600} />
      {value.experience.map((role, i) => (
        <Area
          key={`${role.company}|${role.title}|${role.dates}`}
          label={[role.title, role.company, role.dates].filter(Boolean).join(" · ")}
          value={role.text}
          rows={5}
          limit={2000}
          onChange={(text) => set({ experience: value.experience.map((r, j) => (j === i ? { ...r, text } : r)) })}
        />
      ))}
      <Area label="Education (one per line)" value={value.education} onChange={(education) => set({ education })} />
      <Area label="Top skills (one per line, at most 5)" value={value.skills} onChange={(skills) => set({ skills })} />
      <Area label="Featured" value={value.featured} onChange={(featured) => set({ featured })} rows={2} />
      <Area
        label="Rows to delete on their profile (one per line)"
        value={value.delete}
        onChange={(del) => set({ delete: del })}
      />
    </div>
  )
}
