"use client"

import type { CSSProperties } from "react"
import { formatCount } from "@/lib/format"
import { LandingCompanyRail } from "./company-rail"
import { SectionTitle } from "./section-title"
import { roleLabel } from "./role-match"
import { useChapterRoles, type RolePick } from "./role-picker"

interface LandingOpenJobsProps {
  pick: RolePick | null
  /** `/public/stats` provenance: listings Myro opened live in the last 7 days. */
  verifiedLive: number | null
  companyNames: string[]
  companiesMonitored: number
}

/**
 * Spec #66 chapter 2: where the jobs are, before what they ask for. Four roles,
 * the visitor's pick first, each with its open count and the employers hiring
 * most. Counts come from the market snapshot; the weekly figure is the one Myro
 * re-opened live, so the page never says "every day" (the scraper is not daily).
 * The rows are data, not links: there is no public per-role page to send them to.
 */
export function LandingOpenJobs({
  pick,
  verifiedLive,
  companyNames,
  companiesMonitored,
}: LandingOpenJobsProps) {
  const shown = useChapterRoles(pick)
  if (!shown) return null

  const most = Math.max(...shown.map((role) => role.jobs), 1)

  return (
    <section className="lp-chapter" data-bridge-step aria-label="Open jobs by role">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <SectionTitle>Open right now at top companies</SectionTitle>
          {verifiedLive ? (
            <p className="lp-section-sub">{formatCount(verifiedLive)} jobs checked live this week</p>
          ) : null}
        </div>

        <ul className="lp-open-roles">
          {shown.map((role) => (
            <li key={role.family} className="lp-open-role">
              <span className="lp-open-role-name" title={role.family}>
                {roleLabel(role.family)}
              </span>
              <span
                className="lp-bar"
                aria-hidden="true"
                style={{ "--lp-bar-fill": `${(role.jobs / most) * 100}%` } as CSSProperties}
              />
              <span className="lp-open-role-count">{formatCount(role.jobs)} jobs</span>
              <span className="lp-open-role-cos">
                {role.top_companies.map((company) => company.name).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <LandingCompanyRail companyNames={companyNames} companiesMonitored={companiesMonitored} />
    </section>
  )
}
