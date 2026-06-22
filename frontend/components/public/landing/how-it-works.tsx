"use client"

import { Upload, Gauge, Target, type LucideIcon } from "lucide-react"
import { SectionTitle } from "@/components/public/landing/section-title"

interface Step {
  n: string
  title: string
  body: string
  Icon: LucideIcon
}

/* The product flow in three plain steps — the user-facing mirror of the Engine
   pipeline (which is the machine view). Upload → Score → Tailor maps 1:1 to the
   real path: drop a CV (S04 dropzone) → /cv-preview scores it → playground +
   signup tailor per job. Copy stays observational per landing voice rules. */
const STEPS: Step[] = [
  {
    n: "01",
    title: "Upload your CV",
    body: "Drop a PDF or DOCX. The Engine reads it in seconds — nothing is saved until you sign up.",
    Icon: Upload,
  },
  {
    n: "02",
    title: "Get your Myro Score",
    body: "A real 0–100 score across 10 career domains — your CV measured against live hiring demand.",
    Icon: Gauge,
  },
  {
    n: "03",
    title: "Tailor and apply",
    body: "Close the gaps the Engine finds, tailor a version for each job, and apply with the CV that fits.",
    Icon: Target,
  },
]

export function LandingHowItWorks() {
  return (
    <section className="lp-howit" id="how-it-works" aria-label="How Myro works">
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <SectionTitle>How it works.</SectionTitle>
          <p className="lp-section-sub">
            Ten minutes from a raw CV to a scored, job-ready one. Three steps.
          </p>
        </div>

        <ol className="lp-howit-grid lp-reveal">
          {STEPS.map(({ Icon, ...step }) => (
            <li className="lp-howit-step" key={step.n}>
              <div className="lp-howit-top">
                <span className="lp-howit-icon" aria-hidden>
                  <Icon size={20} strokeWidth={1.5} />
                </span>
                <span className="lp-howit-num">STEP {step.n}</span>
              </div>
              <div className="lp-howit-title">{step.title}</div>
              <p className="lp-howit-body">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
