/**
 * CvTailSections — Education and Certifications, the two master-owned sections
 * that close the paper.
 *
 * These used to render read-only off the master surface, and to be OMITTED when
 * empty. Both were wrong for the same reason: an absent section is invisible, so
 * a CV missing its education read as complete. They now always render — filled,
 * or as a dashed placeholder with an `add ›` — and `add ›` writes through to the
 * master from whichever surface the user is standing on (locked 2026-08-25).
 * Identity fields stay master-only; these two do not, because they are content,
 * not identity.
 */
"use client"

import type { CVStructured } from "@/lib/api"
import { EmptySection } from "./cv-empty-section"

interface CvTailSectionsProps {
  cv: CVStructured
  /** Present ⇒ entries are editable and `add ›` appends one. */
  onPatch?: (mut: (draft: CVStructured) => CVStructured) => void
  /** One block when the paper's section_order splits them. Headings then live
   *  on the sortable section chrome, not inside this file. */
  only?: "education" | "certs"
}

export function CvTailSections({ cv, onPatch, only }: CvTailSectionsProps) {
  const addEducation = () => onPatch?.(d => ({
    ...d,
    education: [...d.education, { institution: "", degree: "", dates: "", grade: "", location: "" }],
  }))
  const addCert = () => onPatch?.(d => ({ ...d, certs: [...d.certs, ""] }))
  const showEdu = only !== "certs"
  const showCerts = only !== "education"
  const hideHeads = only != null

  return (
    <>
      {showEdu && (
        <>
          {!hideHeads && <div className="cvw-sec" id="cvw-sec-education">Education</div>}
          {cv.education.length === 0 ? (
            <EmptySection
              copy="Empty — where you studied, one line."
              severity="optional"
              onAdd={onPatch ? addEducation : undefined}
            />
          ) : (
            <div className="cvw-card">
              {cv.education.map((ed, i) => (
                <div key={`edu-${i}`} className="cvw-line">
                  <span className="cvw-gutter" aria-hidden />
                  <div className="cvw-linebody">
                    {onPatch ? (
                      <div className="cvw-idgrid">
                        <input className="cvw-edit" value={ed.institution} placeholder="Institution"
                          aria-label="Institution"
                          onChange={e => onPatch(d => { d.education[i].institution = e.target.value; return d })} />
                        <input className="cvw-edit" value={ed.degree} placeholder="Degree"
                          aria-label="Degree"
                          onChange={e => onPatch(d => { d.education[i].degree = e.target.value; return d })} />
                        <input className="cvw-edit" value={ed.dates} placeholder="Dates"
                          aria-label="Dates"
                          onChange={e => onPatch(d => { d.education[i].dates = e.target.value; return d })} />
                        <input className="cvw-edit" value={ed.grade} placeholder="Grade"
                          aria-label="Grade"
                          onChange={e => onPatch(d => { d.education[i].grade = e.target.value; return d })} />
                      </div>
                    ) : (
                      <p className="cvw-linetext">
                        {[ed.institution, ed.degree, ed.grade, ed.dates].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {onPatch ? (
                    <button
                      type="button"
                      className="cvw-verdict"
                      aria-label="Remove this education entry"
                      onClick={() => onPatch(d => { d.education.splice(i, 1); return d })}
                    >remove</button>
                  ) : <span aria-hidden />}
                </div>
              ))}
              {onPatch && <AddRow label="Add another" onAdd={addEducation} />}
            </div>
          )}
        </>
      )}

      {showCerts && (
        <>
          {!hideHeads && <div className="cvw-sec" id="cvw-sec-certs">Certifications</div>}
          {cv.certs.length === 0 ? (
            <EmptySection
              copy="Empty — optional, and only worth a line if a cert names a tool the job asks for."
              severity="optional"
              onAdd={onPatch ? addCert : undefined}
            />
          ) : (
            <div className="cvw-card">
              {cv.certs.map((cert, i) => (
                <div key={`cert-${i}`} className="cvw-line">
                  <span className="cvw-gutter" aria-hidden />
                  <div className="cvw-linebody">
                    {onPatch ? (
                      <input className="cvw-edit" value={cert} placeholder="Certification"
                        aria-label="Certification"
                        onChange={e => onPatch(d => { d.certs[i] = e.target.value; return d })} />
                    ) : (
                      <p className="cvw-linetext">{cert}</p>
                    )}
                  </div>
                  {onPatch ? (
                    <button
                      type="button"
                      className="cvw-verdict"
                      aria-label="Remove this certification"
                      onClick={() => onPatch(d => { d.certs.splice(i, 1); return d })}
                    >remove</button>
                  ) : <span aria-hidden />}
                </div>
              ))}
              {onPatch && <AddRow label="Add another" onAdd={addCert} />}
            </div>
          )}
        </>
      )}
    </>
  )
}

function AddRow({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className="cvw-line">
      <span className="cvw-gutter" aria-hidden />
      <div className="cvw-linebody">
        <button type="button" className="cvw-lineact" onClick={onAdd}>＋ {label}</button>
      </div>
      <span aria-hidden />
    </div>
  )
}
