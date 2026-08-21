"use client"

import type { NameCountItem } from "@/lib/api"
import { formatCount } from "@/lib/format"

/** Illustrative role families + fit values. The company names and their open
 *  counts are real (`by_company`); the role and the fit % are a sample, because
 *  the visitor has not uploaded a CV. The eyebrow says so. */
const SAMPLE_ROLES = [
  "Associate Product Manager",
  "Business Analyst, Consulting",
  "Data Analyst, Risk",
  "Frontend Engineer",
] as const
const SAMPLE_FITS = [81, 74, 58, 52] as const

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
  const rows = (companies.length
    ? companies.map((c) => ({ name: c.name, count: c.count }))
    : companyNames.map((name) => ({ name, count: 0 }))
  )
    .filter((row) => row.name)
    .slice(0, SAMPLE_ROLES.length)

  /* fetch → parse → embed → index is a real order: a listing cannot be matched
     before it is indexed, and cannot be indexed before it is fetched. */
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
    { name: "index", note: "Your CV is scored against it, with the numbers you see below." },
  ]

  return (
    <>
      <article className="lp-uc-card" aria-label="Example fits against live openings">
        <span className="lp-card-eyebrow">Example fits · sample CV</span>

        {rows.length ? (
          <ol className="lp-uc-rows">
            {rows.map((row, index) => (
              <li key={row.name} className="lp-uc-row">
                <span>
                  <strong>{SAMPLE_ROLES[index]}</strong>
                  <small>
                    {row.name}
                    {row.count ? ` · ${formatCount(row.count)} open` : ""}
                  </small>
                </span>
                <span className="lp-uc-pill" data-tone="accent">{SAMPLE_FITS[index]}%</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="lp-uc-empty">Live company data is warming up. Check back shortly.</p>
        )}

        <p className="lp-uc-foot">
          No boards, no reposts. Every row is read from the company&rsquo;s own career page.
        </p>
      </article>

      <article className="lp-uc-card" aria-label="How a listing reaches the index">
        <span className="lp-card-eyebrow">How a listing gets here</span>

        <ol className="lp-uc-steps">
          {steps.map((step) => (
            <li key={step.name} className="lp-uc-step">
              <strong>{step.name}</strong>
              <span>{step.note}</span>
            </li>
          ))}
        </ol>

        <a className="lp-uc-link" href="#live-mirror">
          watch the runner live <span aria-hidden="true">↓</span>
        </a>
      </article>
    </>
  )
}
