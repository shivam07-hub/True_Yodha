"use client"

/** A gap carries two readings: what the market pays for it, and how far this CV
 *  already is. `demand` is the one that decides the order to close them in. */
const GAPS = [
  { skill: "Product Strategy", demand: "very high demand", stage: "not on CV" },
  { skill: "Go-to-Market Strategy", demand: "high demand", stage: "early stage" },
  { skill: "User Research & Discovery", demand: "very high demand", stage: "early stage" },
]

const STRENGTHS = [
  { skill: "Data & Business Analysis", note: "PM teams rely on this daily to validate decisions." },
  { skill: "Stakeholder Management", note: "Non-negotiable for shipping product cross-functionally." },
  { skill: "Agile Project Management", note: "Translates vision into sprints engineering can execute." },
]

/** Tab 01, left card: an example Myro Score. Labelled as a sample so a visitor
 *  never reads 62 as their own result. */
export function LandingScoreSample() {
  return (
    <article className="lp-uc-card" aria-label="Example Myro Score of 62 out of 100">
      <div className="lp-score-head">
        <span className="lp-card-eyebrow">Example Myro Score</span>
        <p className="lp-score-verdict">Strong enough to apply. A few high-value gaps remain.</p>
      </div>

      <div className="lp-score-num">
        <strong className="tabular-nums">62</strong>
        <span>/100</span>
      </div>

      <div className="lp-score-meter" aria-hidden="true">
        <span />
      </div>

      <div className="lp-score-cols">
        <div className="lp-score-gaps">
          <h3>Improve before applying</h3>
          <ul>
            {GAPS.map((gap) => (
              <li key={gap.skill}>
                <strong>{gap.skill}</strong>
                <small><b>{gap.demand}</b> · {gap.stage}</small>
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
