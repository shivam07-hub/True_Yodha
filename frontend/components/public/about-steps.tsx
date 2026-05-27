"use client"

import "./about-hero.css"

import "./about-steps.css"

const STEPS = [
  {
    num: "01",
    labelLeft: "Upload in ",
    labelEmphasis: "2 minutes.",
    labelRight: "",
    body: "Drop your existing CV once. That becomes your master — the clean source everything branches from.",
  },
  {
    num: "02",
    labelLeft: "Tailor for any role in ",
    labelEmphasis: "5 minutes.",
    labelRight: "",
    body: "Pick a job. AI rewrites your CV for that exact role — internship, placement, senior position, any industry.",
  },
  {
    num: "03",
    labelLeft: "Know which version to send in ",
    labelEmphasis: "3 minutes.",
    labelRight: "",
    body: "A score and skill gap map tells you where you stand. Send the right CV. Not a generic one.",
  },
] as const

export function AboutSteps() {
  return (
    <section className="tm-about-steps" aria-label="How Myro works">
      <div className="tm-about-steps-inner">
        {STEPS.map((step) => (
          <div key={step.num} className="tm-about-step">
            <div className="tm-about-step-num">{step.num}</div>
            <p className="tm-about-step-label">
              {step.labelLeft}
              <span className="tm-about-step-label-emphasis">{step.labelEmphasis}</span>
              {step.labelRight}
            </p>
            <p className="tm-about-step-body">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
