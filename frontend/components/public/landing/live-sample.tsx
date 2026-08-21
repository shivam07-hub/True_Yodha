"use client"

import type { NameCountItem } from "@/lib/api"
import { formatCount } from "@/lib/format"

/** Handoff §4: four role rows, the top two fits accent-outline and the bottom
 *  two neutral, so rank is legible before the numbers are read. Company names
 *  come from `analytics.by_company`; the role and the fit % are illustrative,
 *  which the eyebrow carries. */
const SAMPLE_ROWS = [
  { role: "Associate Product Manager", fit: 81, strong: true },
  { role: "Business Analyst · Consulting", fit: 74, strong: true },
  { role: "Data Analyst · Risk", fit: 58, strong: false },
  { role: "Frontend Engineer", fit: 52, strong: false },
] as const

export function LandingLiveSample({
  companies,
  companyNames,
  companiesMonitored,
  skillsMapped,
}: {
  companies: NameCountItem[]
  companyNames: string[]
  companiesMonitored: number
  skillsMapped: number
}) {
  const names = (companies.length ? companies.map((c) => c.name) : companyNames)
    .filter(Boolean)
    .slice(0, SAMPLE_ROWS.length)

  /* fetch → parse → embed → index is a real order: a listing cannot be matched
     before it is indexed, and cannot be indexed before it is fetched. The
     numbers inside are props, never literals (HANDOFF.md §3). */
  const steps = [
    {
      name: "fetch",
      note: `A self-hosted open model visits ${formatCount(companiesMonitored)} career pages on a loop.`,
    },
    { name: "parse", note: "Titles, locations and requirements come out as structured fields." },
    {
      name: "embed",
      note: `${formatCount(skillsMapped)} skills mapped to one taxonomy, so demand is comparable.`,
    },
    { name: "index", note: "Your CV is scored against it — the same numbers you see below." },
  ]

  return (
    <>
      <article className="lp-uc-card" aria-label="Example fits against live openings">
        <span className="lp-card-eyebrow">example fits · sample CV</span>

        {names.length ? (
          <ol className="lp-uc-rows">
            {names.map((name, index) => (
              <li key={name} className="lp-uc-row">
                <span>
                  <strong>{SAMPLE_ROWS[index].role}</strong>
                  <small>{name}</small>
                </span>
                <span
                  className="lp-uc-pill"
                  data-tone={SAMPLE_ROWS[index].strong ? "accent" : undefined}
                >
                  {SAMPLE_ROWS[index].fit}% fit
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="lp-uc-empty">Live company data is warming up — check back shortly.</p>
        )}

        <div className="lp-uc-spacer" aria-hidden="true" />

        <p className="lp-uc-foot">
          No boards, no reposts — every row read from the company&rsquo;s own career page.
        </p>
      </article>

      <article className="lp-uc-card" aria-label="How a listing reaches the index">
        <span className="lp-card-eyebrow">how a listing gets here</span>

        <ol className="lp-uc-steps">
          {steps.map((step, index) => (
            <li key={step.name} className="lp-uc-step">
              <span className="lp-uc-step-n" aria-hidden="true">0{index + 1}</span>
              <strong>{step.name}</strong>
              <span>{step.note}</span>
            </li>
          ))}
        </ol>

        <div className="lp-uc-spacer" aria-hidden="true" />

        <a className="lp-uc-link" href="#live-mirror">
          watch the runner live <span aria-hidden="true">↓</span>
        </a>
      </article>
    </>
  )
}
