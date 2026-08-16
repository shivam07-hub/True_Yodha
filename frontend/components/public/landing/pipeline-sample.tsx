"use client"

/** Tab 03 is a labelled sample — no public pipeline endpoint exists, so every
 *  count and row here is illustrative. The `example pipeline` eyebrow carries
 *  that; nothing below claims to be live. */
const STAGES = [
  { label: "Saved", count: 12 },
  { label: "Applied", count: 5 },
  { label: "Interviewing", count: 3 },
  { label: "Offer", count: 1 },
] as const

const ROWS = [
  { role: "Product Analyst", company: "Axis Bank", stage: "Applied" },
  { role: "Data Scientist", company: "Genpact", stage: "Interviewing" },
  { role: "Program Manager", company: "Wipro", stage: "Saved" },
] as const

/** One mentor voice line, kept in a single place so it can be swapped without
 *  touching layout. */
const MENTOR = {
  who: "Myo · your mentor",
  line: "One clean application beats ten rushed ones. Let’s line them up.",
} as const

export function LandingPipelineSample() {
  return (
    <div className="lp-pipeline">
      <p className="lp-card-eyebrow">example pipeline</p>

      <div className="lp-pipeline-stages" aria-label="Application stages">
        {STAGES.map((stage) => (
          <div key={stage.label} className="lp-pipeline-stage">
            <span className="lp-pipeline-count">{stage.count}</span>
            <span className="lp-pipeline-stage-lbl">{stage.label}</span>
          </div>
        ))}
      </div>

      <ol className="lp-pipeline-rows">
        {ROWS.map((row) => (
          <li key={row.role} className="lp-pipeline-row">
            <span className="lp-pipeline-role">
              <strong>{row.role}</strong>
              <small>{row.company}</small>
            </span>
            <span className="lp-pipeline-pill" data-stage={row.stage.toLowerCase()}>
              {row.stage}
            </span>
          </li>
        ))}
      </ol>

      <figure className="lp-pipeline-mentor">
        <figcaption className="lp-pipeline-mentor-who">{MENTOR.who}</figcaption>
        <blockquote className="lp-pipeline-mentor-line">“{MENTOR.line}”</blockquote>
      </figure>
    </div>
  )
}
