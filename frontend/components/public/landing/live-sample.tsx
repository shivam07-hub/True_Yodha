"use client"

import { Fragment } from "react"
import type { NameCountItem } from "@/lib/api"

/** The honest half of tab 02: the four things the Engine actually does to a
 *  listing before it can be matched. Process, not a claim. */
const STEPS = ["fetch", "parse", "embed", "index"] as const

/** Illustrative role families + fit values. Real company names carry the row;
 *  the fit % is a sample (a visitor hasn't uploaded a CV) — the eyebrow says so. */
const SAMPLE_ROLES = ["Product Analyst", "Data Scientist", "Program Manager"] as const
const SAMPLE_FITS = [88, 74, 61] as const

export function LandingLiveSample({
  companies,
  companyNames,
}: {
  companies: NameCountItem[]
  companyNames: string[]
}) {
  const names = (companies.length ? companies.map((c) => c.name) : companyNames)
    .filter(Boolean)
    .slice(0, 3)

  return (
    <div className="lp-live-sample">
      <p className="lp-card-eyebrow">example fits · sample CV</p>

      <div className="lp-live-steps" aria-label="How the Engine reads a listing">
        {STEPS.map((step, index) => (
          <Fragment key={step}>
            <span className="lp-live-step">{step}</span>
            {index < STEPS.length - 1 ? (
              <span className="lp-live-arrow" aria-hidden="true">→</span>
            ) : null}
          </Fragment>
        ))}
      </div>

      {names.length ? (
        <ol className="lp-live-rows">
          {names.map((name, index) => (
            <li key={name} className="lp-live-row">
              <span className="lp-live-role">
                <strong>{SAMPLE_ROLES[index % SAMPLE_ROLES.length]}</strong>
                <small>{name}</small>
              </span>
              <span className="lp-live-fit">{SAMPLE_FITS[index % SAMPLE_FITS.length]}% fit</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="lp-live-empty">Live company data is warming up — check back shortly.</p>
      )}
    </div>
  )
}
