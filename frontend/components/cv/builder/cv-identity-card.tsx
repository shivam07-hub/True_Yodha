/**
 * CvIdentityCard — the CV's contact block, at the top of the paper.
 *
 * Identity stays master-owned: a tailored CV parents to the Main CV, so the
 * name/email/phone fields are editable ONLY on the master surface. Off-master
 * the same block renders read-only rather than being hidden — the recruiter
 * sees it, so the user must too.
 */
"use client"

import type { CVContact, CVStructured } from "@/lib/api"

export interface IdentityLines {
  name: string
  title: string
  /** Contact facts, in reading order. Empty entries are dropped by the caller. */
  meta: string[]
}

interface CvIdentityCardProps {
  lines: IdentityLines
  /** Master surface only. */
  contact?: CVContact | null
  onPatch?: (mut: (draft: CVStructured) => CVStructured) => void
}

const BLANK_CONTACT: CVContact = {
  name: "", title: "", email: "", phone: "", location: "", linkedin: "",
}

export function CvIdentityCard({ lines, contact, onPatch }: CvIdentityCardProps) {
  if (!onPatch) {
    return (
      <div className="cvw-card cvw-idcard">
        <div className="cvw-idname">{lines.name}</div>
        {lines.title && <div className="cvw-idrole">{lines.title}</div>}
        {lines.meta.length > 0 && (
          <div className="cvw-idgrid">
            {lines.meta.map(m => <span key={m}>{m}</span>)}
          </div>
        )}
      </div>
    )
  }

  const set = (key: keyof CVContact, value: string) =>
    onPatch(d => ({ ...d, contact: { ...BLANK_CONTACT, ...(d.contact ?? {}), [key]: value } }))
  const c = contact ?? BLANK_CONTACT

  return (
    <div className="cvw-card cvw-idcard">
      <input
        className="cvw-edit cvw-idname"
        value={c.name ?? ""}
        placeholder="Full name"
        aria-label="Full name"
        onChange={e => set("name", e.target.value)}
      />
      <input
        className="cvw-edit cvw-idrole"
        value={c.title ?? ""}
        placeholder="Headline, e.g. GTM Manager"
        aria-label="Headline"
        onChange={e => set("title", e.target.value)}
      />
      <div className="cvw-idgrid">
        <input className="cvw-edit" type="email" value={c.email ?? ""} placeholder="Email"
          aria-label="Email" onChange={e => set("email", e.target.value)} />
        <input className="cvw-edit" type="tel" value={c.phone ?? ""} placeholder="Phone"
          aria-label="Phone" onChange={e => set("phone", e.target.value)} />
        <input className="cvw-edit" value={c.location ?? ""} placeholder="Location"
          aria-label="Location" onChange={e => set("location", e.target.value)} />
        <input className="cvw-edit" value={c.linkedin ?? ""} placeholder="LinkedIn URL"
          aria-label="LinkedIn URL" onChange={e => set("linkedin", e.target.value)} />
      </div>
    </div>
  )
}
