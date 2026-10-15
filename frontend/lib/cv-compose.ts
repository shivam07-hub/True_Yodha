/**
 * Mirror of backend/app/services/cv_compose.py — keep in sync.
 *
 * Computes stable item_ids for CV bullets/sections so the playground toggle state
 * (Set<itemId>) matches what the backend renders when saving a version.
 *
 * Also renders the deterministic CV text client-side so live preview updates
 * instantly without a server round-trip (Q15 live-preview lock).
 */

import type { CVStructured } from "./api"

function djb2(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let h = 5381
  for (let i = 0; i < bytes.length; i++) {
    h = ((h * 33) + bytes[i]) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

export function itemId(sectionType: string, index: number, content: string): string {
  const body = (content || "").trim().slice(0, 60).toLowerCase()
  return `${sectionType}:${index}:${djb2(body)}`
}

export interface PlaygroundItem {
  id: string
  sectionType:
    | "summary"
    | "exp_bullet"
    | "proj_bullet"
    | "edu"
    | "skills_line"
    | "cert"
  content: string
  // Provenance for badge computation / preview rendering
  expIndex?: number  // experience group index
  bulletIndex?: number
}

export function collectItems(cv: CVStructured): PlaygroundItem[] {
  const items: PlaygroundItem[] = []

  if (cv.summary) {
    items.push({ id: itemId("summary", 0, cv.summary), sectionType: "summary", content: cv.summary })
  }

  cv.experience.forEach((exp, i) => {
    exp.bullets.forEach((bullet, j) => {
      items.push({
        id: itemId("exp_bullet", i * 100 + j, bullet),
        sectionType: "exp_bullet",
        content: bullet,
        expIndex: i,
        bulletIndex: j,
      })
    })
  })

  cv.projects.forEach((proj, i) => {
    proj.bullets.forEach((bullet, j) => {
      items.push({
        id: itemId("proj_bullet", i * 100 + j, bullet),
        sectionType: "proj_bullet",
        content: bullet,
        expIndex: i,
        bulletIndex: j,
      })
    })
  })

  cv.education.forEach((edu, i) => {
    const idLine = [edu.institution, edu.degree, edu.dates].filter(Boolean).join(" · ")
    const content = [edu.institution, edu.degree, edu.grade, edu.dates].filter(Boolean).join(" · ")
    items.push({ id: itemId("edu", i, idLine), sectionType: "edu", content })
  })

  if (cv.skills_line) {
    items.push({ id: itemId("skills_line", 0, cv.skills_line), sectionType: "skills_line", content: cv.skills_line })
  }

  cv.certs.forEach((cert, i) => {
    items.push({ id: itemId("cert", i, cert), sectionType: "cert", content: cert })
  })

  return items
}

/** A blank string is no content. The backend's `is_blank` is the same rule. */
export function isBlank(value: unknown): boolean {
  return !String(value ?? "").trim()
}

/** Headings the seven contract keys already render. Mirror of cv_compose._KNOWN_HEADINGS. */
const KNOWN_HEADINGS = new Set([
  "summary", "professional summary", "profile", "objective", "about",
  "experience", "work experience", "professional experience", "employment",
  "employment history", "work history", "career history",
  "education", "academic background", "qualifications",
  "skills", "technical skills", "core skills", "key skills", "competencies",
  "core competencies",
  "projects", "personal projects", "academic projects",
  "certifications", "certificates", "licenses",
])

const SECTION_WORDS = new Set([
  "experience", "work experience", "professional experience", "employment",
  "employment history", "work history", "career history",
  "education", "academic background", "qualifications",
  "skills", "technical skills", "core skills", "key skills", "competencies",
  "projects", "personal projects", "academic projects",
  "certifications", "certificates", "licenses",
  "summary", "professional summary", "profile", "objective", "about",
  "achievements", "awards", "honors", "honours", "publications",
  "interests", "hobbies", "languages", "references", "volunteering",
])

function normHeading(line: string): string {
  return line.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).join(" ")
}

function isBullet(line: string): boolean {
  const stripped = line.trim()
  return stripped.startsWith("•") || stripped.startsWith("-") || stripped.startsWith("*") || stripped.startsWith("–")
}

function isTitleLabel(line: string): boolean {
  const words = line.split(/\s+/)
  if (words.length < 2 || words.length > 6) return false
  if (/[0-9,.;:()]/.test(line)) return false
  const joiners = new Set(["and", "of", "the", "for"])
  return words.every(word => {
    const bare = word.replace(/^[&/-]+|[&/-]+$/g, "")
    if (!bare || joiners.has(bare.toLowerCase())) return true
    return bare[0] === bare[0].toUpperCase()
  })
}

function isBlockHeading(line: string, next: string | null): boolean {
  const stripped = line.trim()
  if (!stripped || stripped.length > 60) return false
  if ("•*-–".includes(stripped[0]) || stripped.includes("·") || stripped.includes("|") || stripped.includes("@")) return false
  if (/\d{4}/.test(stripped)) return false
  const key = normHeading(stripped)
  if (key && SECTION_WORDS.has(key)) return true
  const letters = stripped.replace(/[^A-Za-z]/g, "")
  if (letters.length >= 3 && letters === letters.toUpperCase() && /^[A-Za-z][A-Za-z0-9 &/,'’.-]*$/.test(stripped)) return true
  return Boolean(next && isBullet(next) && isTitleLabel(stripped))
}

/** Sections a CV holds that the seven keys cannot. Verbatim, original order. */
export function unknownSections(previousBodyText: string | null | undefined): string {
  if (!previousBodyText) return ""
  const lines = previousBodyText.split("\n")
  const starts: number[] = []
  lines.forEach((line, index) => {
    const next = lines.slice(index + 1).find(item => item.trim()) ?? null
    if (line.trim() && isBlockHeading(line, next)) starts.push(index)
  })
  const blocks: string[] = []
  starts.forEach((start, position) => {
    if (KNOWN_HEADINGS.has(normHeading(lines[start]))) return
    const end = position + 1 < starts.length ? starts[position + 1] : lines.length
    const chunk = lines.slice(start, end).join("\n").trim()
    if (chunk) blocks.push(chunk)
  })
  return blocks.join("\n\n")
}

export function renderDeterministic(
  cv: CVStructured,
  hiddenItems: Set<string>,
  carryUnknownFrom?: string | null,
): string {
  const keep = (iid: string) => !hiddenItems.has(iid)
  const lines: string[] = []

  const contact = cv.contact
  if (contact) {
    const contactLine = [contact.location, contact.email, contact.phone, contact.linkedin]
      .map(value => value.trim())
      .filter(Boolean)
      .join(" · ")
    if (contact.name.trim()) lines.push(contact.name.trim())
    if (contact.title.trim()) lines.push(contact.title.trim())
    if (contactLine) lines.push(contactLine)
    if (contact.name.trim() || contact.title.trim() || contactLine) lines.push("")
  }

  if (cv.summary) {
    const iid = itemId("summary", 0, cv.summary)
    if (keep(iid)) {
      lines.push("SUMMARY")
      lines.push(cv.summary)
      lines.push("")
    }
  }

  if (cv.experience.length) {
    const blocks: string[][] = []
    cv.experience.forEach((exp, i) => {
      const keptBullets: string[] = []
      exp.bullets.forEach((bullet, j) => {
        const iid = itemId("exp_bullet", i * 100 + j, bullet)
        if (keep(iid)) keptBullets.push(bullet)
      })
      if (!keptBullets.length) return
      const header = [exp.role, exp.company, exp.dates].filter(Boolean).join(" · ")
      blocks.push([header, ...keptBullets.map(b => `• ${b}`)])
    })
    if (blocks.length) {
      lines.push("EXPERIENCE")
      blocks.forEach(b => { lines.push(...b); lines.push("") })
    }
  }

  if (cv.projects.length) {
    const blocks: string[][] = []
    cv.projects.forEach((proj, i) => {
      const keptBullets: string[] = []
      proj.bullets.forEach((bullet, j) => {
        const iid = itemId("proj_bullet", i * 100 + j, bullet)
        if (keep(iid)) keptBullets.push(bullet)
      })
      if (!keptBullets.length) return
      const header = [proj.name, proj.dates].filter(Boolean).join(" · ")
      blocks.push([header, ...keptBullets.map(b => `• ${b}`)])
    })
    if (blocks.length) {
      lines.push("PROJECTS")
      blocks.forEach(b => { lines.push(...b); lines.push("") })
    }
  }

  const keptEdu: string[] = []
  cv.education.forEach((edu, i) => {
    const idLine = [edu.institution, edu.degree, edu.dates].filter(Boolean).join(" · ")
    const content = [edu.institution, edu.degree, edu.grade, edu.dates].filter(Boolean).join(" · ")
    const iid = itemId("edu", i, idLine)
    if (keep(iid)) keptEdu.push(content)
  })
  if (keptEdu.length) {
    lines.push("EDUCATION")
    lines.push(...keptEdu)
    lines.push("")
  }

  if (cv.skills_line) {
    const iid = itemId("skills_line", 0, cv.skills_line)
    if (keep(iid)) {
      lines.push("SKILLS")
      lines.push(cv.skills_line)
      lines.push("")
    }
  }

  const keptCerts: string[] = []
  cv.certs.forEach((cert, i) => {
    const iid = itemId("cert", i, cert)
    if (keep(iid) && !isBlank(cert)) keptCerts.push(cert)
  })
  if (keptCerts.length) {
    lines.push("CERTIFICATIONS")
    lines.push(...keptCerts.map(c => `• ${c}`))
    lines.push("")
  }

  const carried = unknownSections(carryUnknownFrom)
  const rendered = lines.join("\n").trimEnd()
  return (carried ? `${rendered}\n\n${carried}` : rendered) + "\n"
}

export function renderBaselineDisplayText(
  bodyText: string | null | undefined,
  structuredCv: CVStructured | null | undefined,
): string {
  if (bodyText && bodyText.trim().length > 0) return bodyText
  if (!structuredCv) return "—"

  const rendered = renderDeterministic(structuredCv, new Set())
  return rendered.trim().length > 0 ? rendered : "—"
}
