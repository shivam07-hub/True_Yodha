"use client"

/* The sample readout card — Myro's value-proof artifact.
   Lives on the landing CV-Hub section (sample state, before a CV is dropped)
   AND on the /login + /signup pages, where it gives every auth surface
   something concrete to show ("every page shows value").

   SampleReadoutCard = the card only (reuses .lp-readout-* styles, expects
   the --lp-* tokens from an ancestor: the .lp-readout section on landing, or
   the .lp-readout-standalone wrapper everywhere else).
   SampleReadout = standalone wrapper (own dark-console token scope + heading)
   for surfaces that aren't the landing page. */

import "./sample-readout.css"

const SAMPLE_GAPS = [
  { skill: "Product Strategy", tag: "Very high demand", hot: true, note: "· Not on CV" },
  { skill: "Go-to-Market Strategy", tag: "High demand", hot: false, note: "· Early stage" },
  { skill: "User Research & Discovery", tag: "Very high demand", hot: true, note: "· Early stage" },
]

const SAMPLE_STRENGTHS = [
  { skill: "Data & Business Analysis", note: "PM teams rely on this daily to validate decisions." },
  { skill: "Stakeholder Management", note: "Non-negotiable for shipping product cross-functionally." },
  { skill: "Agile Project Management", note: "Translates vision into sprints engineering can execute." },
]

export function SampleReadoutCard({ className = "" }: { className?: string }) {
  return (
    <div className={`lp-readout-card${className ? ` ${className}` : ""}`}>
      <div className="lp-readout-head">
        <div>
          <div className="lp-readout-version">Content intern version</div>
          <div className="lp-readout-score">
            <span className="lp-readout-score-num">62</span>
            <span className="lp-readout-score-denom">/100</span>
          </div>
        </div>
        <p className="lp-readout-verdict">
          Strong enough to apply, with a few high-value gaps still holding the profile back.
        </p>
      </div>

      <div className="lp-readout-bar">
        <span />
      </div>

      <div className="lp-readout-cols">
        <div className="lp-readout-col">
          <div className="lp-readout-col-title warn">Improve before applying</div>
          <div className="lp-readout-items">
            {SAMPLE_GAPS.map((g) => (
              <div key={g.skill}>
                <div className="lp-readout-skill">{g.skill}</div>
                <div className="lp-readout-tags">
                  <span className={`lp-readout-tag${g.hot ? " hot" : ""}`}>{g.tag}</span>
                  <span className="lp-readout-note-sm">{g.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-readout-col">
          <div className="lp-readout-col-title ok">Already strong</div>
          <div className="lp-readout-items">
            {SAMPLE_STRENGTHS.map((s) => (
              <div key={s.skill}>
                <div className="lp-readout-skill">{s.skill}</div>
                <p className="lp-readout-note">{s.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SampleReadout({
  eyebrow = "Sample readout",
  title = "What the Engine says about one CV version.",
}: {
  eyebrow?: string
  title?: string
}) {
  return (
    <div className="lp-readout-standalone">
      <div className="sr-head">
        <span className="sr-eyebrow">{eyebrow}</span>
        <h2 className="sr-title">{title}</h2>
      </div>
      <SampleReadoutCard />
    </div>
  )
}
