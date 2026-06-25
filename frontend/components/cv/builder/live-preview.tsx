/**
 * Live preview pane — dark mono render of the current playground state
 * with target keywords highlighted.
 */
"use client"

import { useEffect, useRef } from "react"
import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { highlightKeywords, type KeywordTarget } from "./keyword-utils"

interface LivePreviewProps {
  cv: CVStructured
  hidden: Set<string>
  keywords: KeywordTarget[]
  contact: { name: string; title: string; email: string; phone: string; linkedin: string }
  focusSkill?: string | null
}

export function LivePreview({ cv, hidden, keywords, contact, focusSkill }: LivePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hl = (t: string) => highlightKeywords(t, keywords)

  // Scroll first bullet containing focusSkill into view and flash it.
  useEffect(() => {
    if (!focusSkill || !containerRef.current) return
    const needle = focusSkill.toLowerCase()
    const divs = Array.from(containerRef.current.querySelectorAll<HTMLElement>("[data-bullet]"))
    for (const el of divs) {
      if (el.textContent?.toLowerCase().includes(needle)) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        el.classList.add("cvb-focus-bullet")
        const timer = setTimeout(() => el.classList.remove("cvb-focus-bullet"), 2200)
        return () => clearTimeout(timer)
      }
    }
  // Run only on mount — focusSkill comes from URL, doesn't change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleExperience = cv.experience
    .map((e, ei) => ({
      ...e,
      keptBullets: e.bullets.filter((b, j) => !hidden.has(itemId("exp_bullet", ei * 100 + j, b))),
    }))
    .filter(e => e.keptBullets.length > 0)

  const visibleProjects = cv.projects
    .map((p, pi) => ({
      ...p,
      keptBullets: p.bullets.filter((b, j) => !hidden.has(itemId("proj_bullet", pi * 100 + j, b))),
    }))
    .filter(p => p.keptBullets.length > 0)

  const summaryHidden = cv.summary ? hidden.has(itemId("summary", 0, cv.summary)) : true
  const skillsHidden = cv.skills_line ? hidden.has(itemId("skills_line", 0, cv.skills_line)) : true

  return (
    <div className="cvb-preview" ref={containerRef}>
      <div style={{ borderBottom: "1px dashed var(--tm-border-soft)", paddingBottom: 12, marginBottom: 12 }}>
        <div style={{ fontFamily: "var(--cvb-font-sans)", fontSize: 16, fontWeight: 600, color: "var(--tm-text)", letterSpacing: "-0.01em" }}>
          {contact.name || "Your name"}
        </div>
        {contact.title && <div style={{ fontSize: 11.5, color: "var(--tm-text-muted)" }}>{contact.title}</div>}
        {(contact.email || contact.phone || contact.linkedin) && (
          <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 4 }}>
            {[contact.email, contact.phone, contact.linkedin].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {cv.summary && !summaryHidden && (
        <>
          <h6>Summary</h6>
          <div style={{ marginBottom: 6 }} data-bullet>{hl(cv.summary)}</div>
        </>
      )}

      {visibleExperience.length > 0 && (
        <>
          <h6>Experience</h6>
          {visibleExperience.map((e, ei) => (
            <div key={ei} style={{ marginBottom: 12 }}>
              <div className="role-line">
                {e.role}{e.company ? ` · ${e.company}` : ""} <span className="dates">{e.dates ? `· ${e.dates}` : ""}</span>
              </div>
              {e.keptBullets.map((b, i) => (
                <div key={i} style={{ paddingLeft: 14, textIndent: -14 }} data-bullet>• {hl(b)}</div>
              ))}
            </div>
          ))}
        </>
      )}

      {visibleProjects.length > 0 && (
        <>
          <h6>Projects</h6>
          {visibleProjects.map((p, pi) => (
            <div key={pi} style={{ marginBottom: 12 }}>
              <div className="role-line">
                {p.name} <span className="dates">{p.dates ? `· ${p.dates}` : ""}</span>
              </div>
              {p.keptBullets.map((b, i) => (
                <div key={i} style={{ paddingLeft: 14, textIndent: -14 }} data-bullet>• {hl(b)}</div>
              ))}
            </div>
          ))}
        </>
      )}

      {cv.education.length > 0 && (() => {
        const visibleEdu = cv.education
          .map((ed, i) => ({
            ed, i,
            idLine: [ed.institution, ed.degree, ed.dates].filter(Boolean).join(" · "),
            display: [ed.institution, ed.degree, ed.grade, ed.dates].filter(Boolean).join(" · "),
          }))
          .filter(({ idLine, i }) => !hidden.has(itemId("edu", i, idLine)))
        if (!visibleEdu.length) return null
        return (
          <>
            <h6>Education</h6>
            {visibleEdu.map(({ display, i }) => <div key={i}>{display}</div>)}
          </>
        )
      })()}

      {cv.skills_line && !skillsHidden && (
        <>
          <h6>Skills</h6>
          <div data-bullet>{hl(cv.skills_line)}</div>
        </>
      )}

      {cv.certs.length > 0 && (() => {
        const visibleCerts = cv.certs.filter((c, i) => !hidden.has(itemId("cert", i, c)))
        if (!visibleCerts.length) return null
        return (
          <>
            <h6>Certifications</h6>
            {visibleCerts.map((c, i) => <div key={i}>• {c}</div>)}
          </>
        )
      })()}
    </div>
  )
}
