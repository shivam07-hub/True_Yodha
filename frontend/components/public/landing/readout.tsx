"use client"

/* Sample readout — DEC-L3: standalone insert between S2 (Engine) and
   S3 (Surfaces). Dark restyle of the former SampleDiagnostic; content
   identical to that component's data. */

const GAPS = [
  { skill: "Product Strategy", tag: "Very high demand", hot: true, note: "· Not on CV" },
  { skill: "Go-to-Market Strategy", tag: "High demand", hot: false, note: "· Early stage" },
  { skill: "User Research & Discovery", tag: "Very high demand", hot: true, note: "· Early stage" },
]

const STRENGTHS = [
  { skill: "Data & Business Analysis", note: "PM teams rely on this daily to validate decisions." },
  { skill: "Stakeholder Management", note: "Non-negotiable for shipping product cross-functionally." },
  { skill: "Agile Project Management", note: "Translates vision into sprints engineering can execute." },
]

export function LandingReadout() {
  return (
    <section className="lp-readout" aria-label="Sample readout">
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <span className="lp-eyebrow">Sample readout</span>
          <h2 className="lp-section-title">What the Engine says about one CV version.</h2>
        </div>

        <div className="lp-readout-card lp-reveal">
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
                {GAPS.map((g) => (
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
                {STRENGTHS.map((s) => (
                  <div key={s.skill}>
                    <div className="lp-readout-skill">{s.skill}</div>
                    <p className="lp-readout-note">{s.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
