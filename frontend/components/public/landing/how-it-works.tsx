"use client"

import { Check, FileText, Hammer } from "lucide-react"

/** What the match reads from. Named inputs, not claims. */
const INPUTS = ["requirements pulled from the job", "skills the company hires for"] as const

const EVIDENCE = [
  { title: "Already evidenced", note: "Use it in the tailored CV.", icon: Check, positive: true },
  { title: "Could be surfaced", note: "Review a truthful suggested line.", icon: FileText, positive: false },
  { title: "Still to build", note: "Upskill without blocking the application.", icon: Hammer, positive: false },
] as const

/** Tab 01, right card. A visitor has not uploaded a CV, so the 73% is an
 *  example — the eyebrow carries that, the same way `score-sample.tsx` carries
 *  the 62. Nothing on this card is live and nothing on it is clickable. */
export function LandingMatchSample() {
  return (
    <article className="lp-uc-card" aria-label="Example Myro job match">
      <div className="lp-fit-head">
        <div>
          <span className="lp-card-eyebrow">Example job match</span>
          <h3 className="lp-uc-title">Your CV against this opening</h3>
        </div>
        <span className="lp-uc-pill" data-tone="accent">73% fit</span>
      </div>

      <div className="lp-evidence-grid">
        {EVIDENCE.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.title} className="lp-evidence-row">
              <span
                className={`lp-evidence-icon${item.positive ? " positive" : ""}`}
                aria-hidden="true"
              >
                <Icon className="size-4" strokeWidth={1.5} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.note}</small>
              </span>
            </div>
          )
        })}
      </div>

      <div className="lp-requirement-list" aria-label="What the match is read from">
        {INPUTS.map((input) => (
          <span key={input}>{input}</span>
        ))}
      </div>

      <div className="lp-fit-actions" aria-label="What the real card offers next">
        <span className="lp-action-primary">Tailor &amp; apply</span>
        <span className="lp-action-secondary">Build skill</span>
      </div>
    </article>
  )
}
