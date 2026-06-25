/**
 * Dark-themed CV render used inside the BaselineView modal.
 * Visual mirror of the PDF page but reuses Myro tokens so it sits in the
 * tactical theme without theme switching.
 */
"use client"

import { useEffect, useRef } from "react"
import type { CVStructured } from "@/lib/api"

interface CVRenderProps {
  cv: CVStructured
  contact: {
    name: string
    title: string
    location: string
    email: string
    phone: string
    linkedin: string
  }
  focusSkill?: string | null
}

function kwMatch(text: string, needle: string): boolean {
  if (needle.length <= 3) {
    return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
  }
  return text.toLowerCase().includes(needle.toLowerCase())
}

export function CVRender({ cv, contact, focusSkill }: CVRenderProps) {
  const containerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!focusSkill || !containerRef.current) return
    const needle = focusSkill.toLowerCase()
    const lis = Array.from(containerRef.current.querySelectorAll<HTMLElement>("li[data-bullet]"))
    for (const el of lis) {
      if (kwMatch(el.textContent ?? "", needle)) {
        el.classList.add("cv-focus-bullet")
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }
    }
  // Run once on mount — focusSkill is from URL, stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <article className="cvb-cv-render" ref={containerRef}>
      <h1 className="cv-name">{contact.name}</h1>
      <div className="cv-title">{contact.title}</div>
      <div className="cv-contact">
        {contact.location && <span>{contact.location}</span>}
        {contact.email && <span>{contact.email}</span>}
        {contact.phone && <span>{contact.phone}</span>}
        {contact.linkedin && <span>{contact.linkedin}</span>}
      </div>

      {cv.summary && (
        <>
          <h2>Summary</h2>
          <p className="cv-summary">{cv.summary}</p>
        </>
      )}

      {cv.experience.length > 0 && (
        <>
          <h2>Experience</h2>
          {cv.experience.map((e, ei) => (
            <div key={ei}>
              <div className="cv-role-head">
                <div>
                  <span className="cv-role">{e.role}</span>
                  {e.company && <span className="cv-co"> · {e.company}</span>}
                </div>
                {e.dates && <span className="cv-dates">{e.dates}</span>}
              </div>
              <ul>
                {e.bullets.map((b, i) => <li key={i} data-bullet>{b}</li>)}
              </ul>
            </div>
          ))}
        </>
      )}

      {cv.projects.length > 0 && (
        <>
          <h2>Projects</h2>
          {cv.projects.map((p, pi) => (
            <div key={pi}>
              <div className="cv-role-head">
                <div><span className="cv-role">{p.name}</span></div>
                {p.dates && <span className="cv-dates">{p.dates}</span>}
              </div>
              <ul>
                {p.bullets.map((b, i) => <li key={i} data-bullet>{b}</li>)}
              </ul>
            </div>
          ))}
        </>
      )}

      {cv.education.length > 0 && (
        <>
          <h2>Education</h2>
          {cv.education.map((ed, i) => (
            <div key={i} className="cv-role-head" style={{ marginTop: 4 }}>
              <div>
                <span className="cv-role">{ed.institution}</span>
                {ed.degree && <span className="cv-co"> · {ed.degree}</span>}
                {ed.grade && <span className="cv-co"> · {ed.grade}</span>}
              </div>
              {ed.dates && <span className="cv-dates">{ed.dates}</span>}
            </div>
          ))}
        </>
      )}

      {cv.skills_line && (
        <>
          <h2>Skills</h2>
          <div className="cv-skills">{cv.skills_line}</div>
        </>
      )}

      {cv.certs.length > 0 && (
        <>
          <h2>Certifications</h2>
          <ul>
            {cv.certs.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </>
      )}
    </article>
  )
}
