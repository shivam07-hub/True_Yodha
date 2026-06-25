/**
 * PdfPage — the single light, ATS-clean resume sheet (`.cvb-pdf-page`).
 *
 * One render shared by the tailored export (PdfPreviewView) and the master
 * CV panel. This is the WYSIWYG document: what is shown here is exactly what
 * `printCvPage` saves to PDF. Structured render (real <ul> bullets, aligned
 * dates) — never a plain-text round-trip.
 */
"use client"

import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import type { CVTemplate } from "@/lib/cv/templates"

export interface PdfPageContact {
  name: string
  title: string
  location: string
  email: string
  phone: string
  linkedin: string
}

interface PdfPageProps {
  cv: CVStructured
  hidden: Set<string>
  contact: PdfPageContact
  /** When present, the foot reads "tailored for {company}". Omit for the master CV. */
  company?: string
  /** Print-CSS variant; written to `data-cv-template`. Defaults to "classic". */
  template?: CVTemplate
  /** Hide the Myro mark in the footer (un-certify). Default false = mark shown. */
  footerMarkHidden?: boolean
}

/** Monochrome Myro footer mark — self-contained inline SVG so it survives the
 *  server PDF render (which grabs `.cvb-pdf-page` outerHTML, no asset loading). */
function FooterMark() {
  return (
    <span className="pdf-foot-mark" aria-label="Myro Certified" title="Myro Certified">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
        <path d="M14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83M16.62 12l-5.74 9.94" />
      </svg>
      <span>Myro</span>
    </span>
  )
}

export function PdfPage({ cv, hidden, contact, company, template = "classic", footerMarkHidden = false }: PdfPageProps) {
  const renderBullets = (bullets: string[], section: "exp_bullet" | "proj_bullet", ei: number) =>
    bullets.filter((b, bi) => !hidden.has(itemId(section, ei * 100 + bi, b)))

  const visibleExperience = cv.experience.map((e, ei) => ({
    ...e,
    keptBullets: renderBullets(e.bullets, "exp_bullet", ei),
  })).filter(e => e.keptBullets.length > 0)

  const visibleProjects = cv.projects.map((p, pi) => ({
    ...p,
    keptBullets: renderBullets(p.bullets, "proj_bullet", pi),
  })).filter(p => p.keptBullets.length > 0)

  const visibleEdu = cv.education.filter((ed, i) => {
    const line = [ed.institution, ed.degree, ed.dates].filter(Boolean).join(" · ")
    return !hidden.has(itemId("edu", i, line))
  })

  const summaryHidden = cv.summary ? hidden.has(itemId("summary", 0, cv.summary)) : true
  const skillsHidden = cv.skills_line ? hidden.has(itemId("skills_line", 0, cv.skills_line)) : true
  const visibleCerts = cv.certs.filter((c, i) => !hidden.has(itemId("cert", i, c)))

  return (
    <div className="cvb-pdf-page" data-cv-template={template}>
      <h1 className="pdf-name">{contact.name}</h1>
      {contact.title && <div className="pdf-title">{contact.title}</div>}
      <div className="pdf-contact">
        {contact.location && <span>{contact.location}</span>}
        {contact.email && <span>{contact.email}</span>}
        {contact.phone && <span>{contact.phone}</span>}
        {contact.linkedin && <span>{contact.linkedin}</span>}
      </div>

      {cv.summary && !summaryHidden && (
        <>
          <h2>Summary</h2>
          <div className="pdf-summary">{cv.summary}</div>
        </>
      )}

      {visibleExperience.length > 0 && (
        <>
          <h2>Experience</h2>
          {visibleExperience.map((e, ei) => (
            <div key={ei}>
              <div className="pdf-role-head">
                <div>
                  <span className="pdf-role">{e.role}</span>
                  {e.company && <span className="pdf-co"> · {e.company}</span>}
                </div>
                {e.dates && <span className="pdf-dates">{e.dates}</span>}
              </div>
              <ul>{e.keptBullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          ))}
        </>
      )}

      {visibleProjects.length > 0 && (
        <>
          <h2>Projects</h2>
          {visibleProjects.map((p, pi) => (
            <div key={pi}>
              <div className="pdf-role-head">
                <div><span className="pdf-role">{p.name}</span></div>
                {p.dates && <span className="pdf-dates">{p.dates}</span>}
              </div>
              <ul>{p.keptBullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          ))}
        </>
      )}

      {visibleEdu.length > 0 && (
        <>
          <h2>Education</h2>
          {visibleEdu.map((ed, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <div>
                <span style={{ fontWeight: 600 }}>{ed.institution}</span>
                {ed.degree && <span style={{ color: "#333" }}> · {ed.degree}</span>}
                {ed.grade && <span style={{ color: "#333" }}> · {ed.grade}</span>}
              </div>
              {ed.dates && <span className="pdf-dates">{ed.dates}</span>}
            </div>
          ))}
        </>
      )}

      {cv.skills_line && !skillsHidden && (
        <>
          <h2>Skills</h2>
          <div className="pdf-skills-line">{cv.skills_line}</div>
        </>
      )}

      {visibleCerts.length > 0 && (
        <>
          <h2>Certifications</h2>
          <ul>{visibleCerts.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </>
      )}

      <div className="pdf-foot">
        <span>{company ? `${contact.name} — tailored for ${company}` : contact.name}</span>
        {!footerMarkHidden && <FooterMark />}
      </div>
    </div>
  )
}
