"use client"

/** Tab 03 is a labelled sample — no public pipeline endpoint exists, so every
 *  count and row here is illustrative. The `example pipeline` eyebrow carries
 *  that; nothing below claims to be live. */
const STAGES = [
  { label: "Applied", count: 12 },
  { label: "Screening", count: 5 },
  { label: "Interview", count: 3, focus: true },
  { label: "Offer", count: 1 },
] as const

const ROWS = [
  { role: "Associate PM · Axis Bank", note: "tailored CV sent · 4 days ago", stage: "Interview", tone: "accent" },
  { role: "Business Analyst · Deloitte", note: "no reply · follow up today", stage: "Stalled", tone: "warning" },
  { role: "Data Analyst · Kotak", note: "CV sent · awaiting screen", stage: "Applied", tone: "" },
] as const

/** Myo's voice, kept in one place so it can be swapped without touching layout. */
const MENTOR_LINE =
  "Deloitte has been quiet for nine days. That is normal for consulting, but your Axis interview is in three. Practise stakeholder trade-offs tonight; it is the question they ask most."

/** What Myo offers next. Captions inside a sample, so they carry no hover, no
 *  pointer and no arrow — the verb names the move without faking a control. */
const NEXT = [
  { verb: "review", title: "Strengthen CV evidence", note: "Add proof only when it is real." },
  { verb: "practise", title: "Build the missing skill", note: "Start with a project at your level." },
  { verb: "prepare", title: "Prepare for the interview", note: "Questions this company actually asks." },
] as const

export function LandingPipelineSample() {
  return (
    <>
      <article className="lp-uc-card" aria-label="Example application pipeline">
        <span className="lp-card-eyebrow">Example pipeline</span>

        <div className="lp-uc-stats" aria-label="Applications by stage">
          {STAGES.map((stage) => (
            <div
              key={stage.label}
              className="lp-uc-stat"
              data-focus={"focus" in stage && stage.focus ? "true" : undefined}
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

      <article className="lp-uc-card" aria-label="What the mentor reads from that pipeline">
        <span className="lp-card-eyebrow">Myo · your mentor</span>

        <blockquote className="lp-mentor-quote">{MENTOR_LINE}</blockquote>

        <div className="lp-mentor-next">
          {NEXT.map((item) => (
            <div key={item.verb} className="lp-mentor-step">
              <span>
                <strong>{item.title}</strong>
                <small>{item.note}</small>
              </span>
              <span className="lp-mentor-verb">{item.verb}</span>
            </div>
          ))}
        </div>

        <p className="lp-uc-foot">
          Myo shares what it knows: the sources, the numbers, the reasoning. Nothing is hidden
          behind a score.
        </p>
      </article>
    </>
  )
}
