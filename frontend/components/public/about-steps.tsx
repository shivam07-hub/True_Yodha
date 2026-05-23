"use client"

import "./about-hero.css"

import "./about-steps.css"

const STEPS = [
  {
    num: "01",
    labelLeft: "Save your ",
    labelEmphasis: "master",
    labelRight: " CV.",
    body: "Keep one clean source instead of hunting through files and folders.",
  },
  {
    num: "02",
    labelLeft: "",
    labelEmphasis: "Tailor versions",
    labelRight: " for each job.",
    body: "Create a resume for internships, placements, and specific companies.",
  },
  {
    num: "03",
    labelLeft: "Use ",
    labelEmphasis: "job intelligence",
    labelRight: " when ready.",
    body: "Scores and skill gaps help you choose what to fix next.",
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
