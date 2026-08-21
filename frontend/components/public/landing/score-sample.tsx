"use client"

/** Handoff §4: three gaps, warning meta on the first only. Ranking everything
 *  ranks nothing — the top gap is the one worth closing before the next. */
const GAPS = [
  { skill: "Product Strategy", demand: "very high demand", stage: "not on CV", top: true },
  { skill: "Go-to-Market Strategy", demand: "high demand", stage: "early stage", top: false },
  { skill: "User Research & Discovery", demand: "very high demand", stage: "early stage", top: false },
]

const STRENGTHS = [
  { skill: "Data & Business Analysis", note: "PM teams rely on this daily to validate decisions." },
  { skill: "Stakeholder Management", note: "Non-negotiable for shipping product cross-functionally." },
  { skill: "Agile Project Management", note: "Translates vision into sprints engineering can execute." },
]

/** Tab 01, left card. Labelled a sample so a visitor never reads 62 as their
 *  own result. The numeral and the bar fill are two of the section's three
 *  permitted glows. */
export function LandingScoreSample() {
  return (
    <article className="lp-uc-card" aria-label="Example Myro Score of 62 out of 100">
      <div className="lp-score-head">
        <span className="lp-card-eyebrow">example myro score</span>
        <p className="lp-score-verdict">Strong enough to apply. A few high-value gaps remain.</p>
      </div>

      <div className="lp-score-num">
        <strong>62</strong>
        <span>/100</span>
      </div>

      <div className="lp-uc-track lp-score-meter" aria-hidden="true">
        <span style={{ width: "62%" }} />
      </div>

      <div className="lp-score-cols">
        <div>
          <h3>improve before applying</h3>
          <ul>
            {GAPS.map((gap) => (
              <li key={gap.skill}>
                <strong>{gap.skill}</strong>
                <small>
                  {gap.top ? <b>{gap.demand}</b> : gap.demand} · {gap.stage}
                </small>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>already strong</h3>
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
