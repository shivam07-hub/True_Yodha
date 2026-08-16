"use client"

const GAPS = [
  { skill: "Product Strategy", tag: "Very high demand", note: "Not on CV" },
  { skill: "Go-to-Market Strategy", tag: "High demand", note: "Early stage" },
  { skill: "User Research & Discovery", tag: "Very high demand", note: "Early stage" },
]

const STRENGTHS = [
  { skill: "Data & Business Analysis", note: "PM teams rely on this daily to validate decisions." },
  { skill: "Stakeholder Management", note: "Non-negotiable for shipping product cross-functionally." },
  { skill: "Agile Project Management", note: "Translates vision into sprints engineering can execute." },
]

/** Light product card of an example Myro Score. Labelled as a sample so a
 *  visitor never reads 62 as their own result. */
export function LandingScoreSample() {
  return (
    <article className="lp-score-frame" aria-label="Example Myro Score of 62 out of 100">
      <header className="lp-score-head">
        <div>
          <span className="lp-card-eyebrow">Example Myro Score</span>
          <div className="lp-score-num">
            <strong className="tabular-nums">62</strong>
            <span>/100</span>
          </div>
        </div>
        <p className="lp-score-verdict text-pretty">
          Strong enough to apply, with a few high-value gaps still holding the profile back.
        </p>
      </header>

      <div className="lp-score-meter" aria-hidden="true">
        <span />
      </div>

      <div className="lp-score-cols">
        <div>
          <h3>Improve before applying</h3>
          <ul>
            {GAPS.map((gap) => (
              <li key={gap.skill}>
                <strong>{gap.skill}</strong>
                <small>{gap.tag} · {gap.note}</small>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Already strong</h3>
          <ul>
            {STRENGTHS.map((item) => (
              <li key={item.skill}>
                <strong>{item.skill}</strong>
                <small>{item.note}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  )
}
