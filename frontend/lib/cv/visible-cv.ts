/**
 * selectVisibleCV — apply the playground's `hidden` set to a structured CV,
 * yielding the sections that actually render (and that download).
 *
 * Single source of truth for "what is on the page": both PdfPage (the WYSIWYG
 * PDF) and the DOCX export payload run through this, so the two formats can
 * never drift. The `itemId` keys here MUST match PdfPage exactly.
 */
import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { normalizeSectionOrder, type SectionKey } from "@/lib/cv/section-order"

export interface VisibleExperience { role: string; company: string; dates: string; bullets: string[] }
export interface VisibleProject { name: string; dates: string; bullets: string[] }
export interface VisibleEducation { institution: string; degree: string; grade: string; dates: string }

export interface VisibleCV {
  summary: string
  experience: VisibleExperience[]
  projects: VisibleProject[]
  education: VisibleEducation[]
  skills_line: string
  certs: string[]
  order: SectionKey[]
}

export function selectVisibleCV(
  cv: CVStructured,
  hidden: Set<string>,
  sectionOrder?: string[] | null,
): VisibleCV {
  const keepBullets = (bullets: string[], section: "exp_bullet" | "proj_bullet", ei: number) =>
    bullets.filter((b, bi) => !hidden.has(itemId(section, ei * 100 + bi, b)))

  const experience = cv.experience
    .map((e, ei) => ({ role: e.role, company: e.company ?? "", dates: e.dates ?? "", bullets: keepBullets(e.bullets, "exp_bullet", ei) }))
    .filter(e => e.bullets.length > 0)

  const projects = cv.projects
    .map((p, pi) => ({ name: p.name, dates: p.dates ?? "", bullets: keepBullets(p.bullets, "proj_bullet", pi) }))
    .filter(p => p.bullets.length > 0)

  const education = cv.education.filter((ed, i) => {
    const line = [ed.institution, ed.degree, ed.dates].filter(Boolean).join(" · ")
    return !hidden.has(itemId("edu", i, line))
  }).map(ed => ({ institution: ed.institution, degree: ed.degree ?? "", grade: ed.grade ?? "", dates: ed.dates ?? "" }))

  const summaryHidden = cv.summary ? hidden.has(itemId("summary", 0, cv.summary)) : true
  const skillsHidden = cv.skills_line ? hidden.has(itemId("skills_line", 0, cv.skills_line)) : true
  const certs = cv.certs.filter((c, i) => !hidden.has(itemId("cert", i, c)))

  return {
    summary: summaryHidden ? "" : (cv.summary ?? ""),
    experience,
    projects,
    education,
    skills_line: skillsHidden ? "" : (cv.skills_line ?? ""),
    certs,
    order: normalizeSectionOrder(sectionOrder),
  }
}
