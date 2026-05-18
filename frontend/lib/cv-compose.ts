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
    const line = [edu.institution, edu.degree, edu.dates].filter(Boolean).join(" · ")
    items.push({ id: itemId("edu", i, line), sectionType: "edu", content: line })
  })

  if (cv.skills_line) {
    items.push({ id: itemId("skills_line", 0, cv.skills_line), sectionType: "skills_line", content: cv.skills_line })
  }

  cv.certs.forEach((cert, i) => {
    items.push({ id: itemId("cert", i, cert), sectionType: "cert", content: cert })
  })

  return items
}

export function renderDeterministic(
  cv: CVStructured,
  hiddenItems: Set<string>,
): string {
  const keep = (iid: string) => !hiddenItems.has(iid)
  const lines: string[] = []

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
    const line = [edu.institution, edu.degree, edu.dates].filter(Boolean).join(" · ")
    const iid = itemId("edu", i, line)
    if (keep(iid)) keptEdu.push(line)
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
    if (keep(iid)) keptCerts.push(cert)
  })
  if (keptCerts.length) {
    lines.push("CERTIFICATIONS")
    lines.push(...keptCerts.map(c => `• ${c}`))
    lines.push("")
  }

  return lines.join("\n").trimEnd() + "\n"
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
