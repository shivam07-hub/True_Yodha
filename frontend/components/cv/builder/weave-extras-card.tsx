/**
 * WeaveExtrasCard — the CV-WIDE lines proposed for this job.
 *
 * These used to land unseen on whichever role was decided first. A summary is
 * the first thing a hiring manager reads; it gets its own card, its own Keep
 * mine / Take this, and it shows what it replaces.
 */
"use client"

export function WeaveExtrasCard({
  summary, skillsLine, currentSummary, currentSkillsLine,
}: {
  summary: string | null
  skillsLine: string | null
  currentSummary: string
  currentSkillsLine: string
}) {
  return (
    <div className="tw-role">
      <div className="tw-role-head">
        <span className="tw-role-title">Top of your CV</span>
        <span className="tw-role-co">SUMMARY &amp; SKILLS</span>
      </div>
      <p className="tw-role-why">The lines a reader meets before any role.</p>

      {summary && (
        <div className="tw-extra">
          <span className="tw-extra-label mono">Summary</span>
          <p className="tw-role-text">{summary}</p>
          {currentSummary && (
            <p className="tw-extra-was">
              <span className="mono">was</span> {currentSummary}
            </p>
          )}
        </div>
      )}

      {skillsLine && (
        <div className="tw-extra">
          <span className="tw-extra-label mono">Skills line</span>
          <p className="tw-role-text">{skillsLine}</p>
          {currentSkillsLine && (
            <p className="tw-extra-was">
              <span className="mono">was</span> {currentSkillsLine}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
