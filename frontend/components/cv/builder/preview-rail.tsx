/**
 * PreviewRail — CV Playground v2 right-rail "Preview" tab, plus the shared
 * V2Sheet renderer the Apply modal reuses (one sheet, two mounts — WYSIWYG:
 * the sheet the user previews is the sheet that gets submitted, ADR-0020).
 *
 * Renders the CURRENT projection (hidden lines excluded, applied rewrites in)
 * with the delta banner: base → current, "+N raised in the playground".
 */
"use client"

import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import type { PageFill } from "@/lib/cv/page-fill"

export interface SheetContact {
  name: string
  title: string
  meta: string
}

interface V2SheetProps {
  cv: CVStructured
  hidden: Set<string>
  contact: SheetContact
  compact?: boolean
}

export function V2Sheet({ cv, hidden, contact, compact }: V2SheetProps) {
  const experience = cv.experience
    .map((e, ei) => ({
      ...e,
      kept: e.bullets.filter((b, bi) => !hidden.has(itemId("exp_bullet", ei * 100 + bi, b))),
    }))
    .filter(e => e.kept.length > 0)
  const projects = cv.projects
    .map((p, pi) => ({
      ...p,
      kept: p.bullets.filter((b, bi) => !hidden.has(itemId("proj_bullet", pi * 100 + bi, b))),
    }))
    .filter(p => p.kept.length > 0)
  const summaryVisible = cv.summary && !hidden.has(itemId("summary", 0, cv.summary))
  const skillsVisible = cv.skills_line && !hidden.has(itemId("skills_line", 0, cv.skills_line))
  const education = cv.education.filter((ed, i) => {
    const idLine = [ed.institution, ed.degree, ed.dates].filter(Boolean).join(" · ")
    return !hidden.has(itemId("edu", i, idLine))
  })
  const certs = cv.certs.filter((c, i) => !hidden.has(itemId("cert", i, c)))

  return (
    <div className={`cvb-v2-sheet${compact ? " compact" : ""}`}>
      <div className="cvb-v2-sheet-name">{contact.name}</div>
      {(contact.title || contact.meta) && (
        <div className="cvb-v2-sheet-meta">{[contact.title, contact.meta].filter(Boolean).join(" · ")}</div>
      )}

      {summaryVisible && <p className="cvb-v2-sheet-summary">{cv.summary}</p>}

      {experience.map((e, i) => (
        <div key={`e-${i}`} className="cvb-v2-sheet-role">
          <div className="cvb-v2-sheet-rolehead">
            <span className="cvb-v2-sheet-roletitle">{e.role}</span>
            {e.company && <span className="cvb-v2-sheet-roleco">— {e.company}</span>}
            <span className="cvb-v2-sheet-dates">{e.dates ?? ""}</span>
          </div>
          <ul className="cvb-v2-sheet-bullets">
            {e.kept.map((b, j) => <li key={j}>{b}</li>)}
          </ul>
        </div>
      ))}

      {projects.map((p, i) => (
        <div key={`p-${i}`} className="cvb-v2-sheet-role">
          <div className="cvb-v2-sheet-rolehead">
            <span className="cvb-v2-sheet-roletitle">{p.name}</span>
            <span className="cvb-v2-sheet-dates">{p.dates ?? ""}</span>
          </div>
          <ul className="cvb-v2-sheet-bullets">
            {p.kept.map((b, j) => <li key={j}>{b}</li>)}
          </ul>
        </div>
      ))}

      {education.length > 0 && (
        <div className="cvb-v2-sheet-role">
          <div className="cvb-v2-sheet-rolehead">
            <span className="cvb-v2-sheet-roletitle">Education</span>
          </div>
          {education.map((ed, i) => (
            <div key={`ed-${i}`} className="cvb-v2-sheet-rolehead">
              <span className="cvb-v2-sheet-roleco">
                {[ed.institution, ed.degree, ed.grade].filter(Boolean).join(" · ")}
              </span>
              <span className="cvb-v2-sheet-dates">{ed.dates ?? ""}</span>
            </div>
          ))}
        </div>
      )}

      {skillsVisible && (
        <div className="cvb-v2-sheet-role">
          <div className="cvb-v2-sheet-rolehead">
            <span className="cvb-v2-sheet-roletitle">Skills</span>
          </div>
          <p className="cvb-v2-sheet-skills">{cv.skills_line}</p>
        </div>
      )}

      {certs.length > 0 && (
        <div className="cvb-v2-sheet-role">
          <div className="cvb-v2-sheet-rolehead">
            <span className="cvb-v2-sheet-roletitle">Certifications</span>
          </div>
          <ul className="cvb-v2-sheet-bullets">
            {certs.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

interface PreviewRailProps {
  cv: CVStructured
  hidden: Set<string>
  contact: SheetContact
  baseScore: number
  ready: number
  delta: number
  company: string
  pageFill: PageFill
  onDownload: () => void
  onApply: () => void
  canApply: boolean
}

export function PreviewRail({
  cv, hidden, contact, baseScore, ready, delta, company, pageFill, onDownload, onApply, canApply,
}: PreviewRailProps) {
  return (
    <div className="cvb-v2-railpane">
      {delta > 0 ? (
        <div className="cvb-v2-deltabanner">
          <span className="cvb-v2-deltabanner-nums mono">{baseScore} → {ready}</span>
          <span className="cvb-v2-deltabanner-copy">
            ▲ +{delta} raised in the playground. This exact sheet is what {company} receives.
          </span>
        </div>
      ) : null}

      <V2Sheet cv={cv} hidden={hidden} contact={contact} />

      <div className="cvb-v2-previewfoot">
        <span className="mono cvb-v2-pagefill">
          {pageFill.fits ? "fits one page" : `spills onto ${pageFill.pages} pages`}
        </span>
        <button type="button" className="cvb-v2-ghostbtn" onClick={onDownload}>Download PDF</button>
      </div>

      <button type="button" className="cvb-v2-applywide" onClick={onApply} disabled={!canApply}>
        Apply with this CV
      </button>
    </div>
  )
}
