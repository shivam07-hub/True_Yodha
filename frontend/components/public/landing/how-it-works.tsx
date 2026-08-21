"use client"

import { Check, FileText, Hammer } from "lucide-react"

/** Handoff §4: bare lucide icons, stroke 1.7, 18px, currentColor. No container
 *  — a glyph in a coloured box is the tell this section is built to avoid. */
const EVIDENCE = [
  { state: "evidenced", icon: Check, title: "Already evidenced", note: "Use it in the tailored CV." },
  { state: "surfaced", icon: FileText, title: "Could be surfaced", note: "Review a truthful suggested line." },
  { state: "build", icon: Hammer, title: "Still to build", note: "Upskill without blocking the application." },
] as const

const INPUTS = ["requirements pulled from the job", "skills the company hires for"] as const

/** Tab 01, right card — the focused card of the pair. A visitor has not
 *  uploaded a CV, so 73% is illustrative; it sits beside a card whose eyebrow
 *  reads "example myro score", which is what keeps the pair honest. */
export function LandingMatchSample() {
  return (
    <article className="lp-uc-card" data-focus="true" aria-label="Myro job match">
      <div className="lp-uc-head">
        <div>
          <span className="lp-card-eyebrow" data-names="object">myro job match</span>
          <h3 className="lp-uc-title">Your CV against this opening</h3>
        </div>
        <span className="lp-uc-pill" data-tone="accent">73% fit</span>
      </div>

      <div className="lp-evidence-grid">
        {EVIDENCE.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.state} className="lp-evidence-row" data-state={item.state}>
              <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                <small>{item.note}</small>
              </span>
            </div>
          )
        })}
      </div>

      <div className="lp-uc-chips" aria-label="What the match is read from">
        {INPUTS.map((input) => (
          <span key={input} className="lp-uc-pill">{input}</span>
        ))}
      </div>

      <div className="lp-uc-spacer" aria-hidden="true" />

      <div className="lp-fit-actions" aria-label="What the real card offers next">
        <span className="lp-action-primary">Tailor &amp; apply</span>
        <span className="lp-action-secondary">Build skill</span>
      </div>
    </article>
  )
}
