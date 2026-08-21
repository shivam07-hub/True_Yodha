"use client"

/** Tab 03 is a labelled sample — no public pipeline endpoint exists, so every
 *  count and row here is illustrative behind the `example pipeline` eyebrow. */
const STAGES = [
  { label: "applied", count: 12, focus: false },
  { label: "screening", count: 5, focus: false },
  { label: "interview", count: 3, focus: true },
  { label: "offer", count: 1, focus: false },
] as const

const ROWS = [
  { role: "Associate PM · Axis Bank", note: "tailored CV sent · 4 days ago", stage: "interview", tone: "success" },
  { role: "Business Analyst · Deloitte", note: "no reply · follow up today", stage: "stalled", tone: "warning" },
  { role: "Data Analyst · Kotak", note: "CV sent · awaiting screen", stage: "applied", tone: "" },
] as const

/** Myo's voice, kept in one place so it can be swapped without touching layout. */
const MENTOR_LINE =
  "“Deloitte has been quiet for nine days. That’s normal for consulting — but your Axis interview is in three. Practise stakeholder trade-offs tonight; it’s the question they ask most.”"

const NEXT = [
  { verb: "review", title: "Strengthen CV evidence", note: "Add proof only when it is real." },
  { verb: "practise", title: "Build the missing skill", note: "Start with a project at your level." },
  { verb: "prepare", title: "Prepare for the interview", note: "Questions this company actually asks." },
] as const

export function LandingPipelineSample() {
  return (
    <>
      <article className="lp-uc-card" aria-label="Example application pipeline">
        <span className="lp-card-eyebrow">example pipeline</span>

        <div className="lp-uc-stats" aria-label="Applications by stage">
          {STAGES.map((stage) => (
            <div
              key={stage.label}
              className="lp-uc-stat"
              data-focus={stage.focus ? "true" : undefined}
            >
              <b>{stage.count}</b>
              <span>{stage.label}</span>
            </div>
          ))}
        </div>

        <ol className="lp-uc-rows">
          {ROWS.map((row) => (
            <li key={row.role} className="lp-uc-row">
              <span>
                <strong>{row.role}</strong>
                <small>{row.note}</small>
              </span>
              <span className="lp-uc-pill" data-tone={row.tone || undefined}>{row.stage}</span>
            </li>
          ))}
        </ol>
      </article>

      <article className="lp-uc-card" data-focus="true" aria-label="What the mentor reads from that pipeline">
        <span className="lp-card-eyebrow" data-names="object">myo · your mentor</span>

        <blockquote className="lp-mentor-quote">{MENTOR_LINE}</blockquote>

        <div className="lp-mentor-next">
          {NEXT.map((item) => (
            <div key={item.verb} className="lp-mentor-step">
              <span>
                <strong>{item.title}</strong>
                <small>{item.note}</small>
              </span>
              <span className="lp-mentor-verb">{item.verb} →</span>
            </div>
          ))}
        </div>

        <div className="lp-uc-spacer" aria-hidden="true" />

        <p className="lp-uc-foot">
          Myo shares what it knows: the sources, the numbers, the reasoning. Nothing is hidden
          behind a score.
        </p>
      </article>
    </>
  )
}
