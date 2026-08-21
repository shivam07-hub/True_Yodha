"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"
import { jobs, type NameCountItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { formatCount } from "@/lib/format"

const DAY_MS = 24 * 60 * 60 * 1000

function humanMode(raw?: string | null): string {
  const value = (raw || "").toLowerCase().trim()
  if (value === "remote") return "Remote"
  if (value === "hybrid") return "Hybrid"
  if (value === "onsite" || value === "on-site") return "On-site"
  return ""
}

/** Tab 04 is the one panel that is genuinely live on both halves: real open
 *  roles per company from `/jobs/at/{company}`, and real openings per industry
 *  from the analytics snapshot. No fit % here — that needs an uploaded CV. */
export function LandingIntelSample({
  companies,
  industries,
  industriesTotal,
}: {
  companies: NameCountItem[]
  industries: NameCountItem[]
  industriesTotal: number
}) {
  const top = companies.filter((c) => c.name).slice(0, 8)
  // Derive the active company so it resolves to the first entry once the async
  // analytics land (companies is [] on the first render) — no effect needed.
  const [selected, setSelected] = useState<string>("")
  const active = selected || top[0]?.name || ""
  const activeCompany = top.find((c) => c.name === active) ?? top[0] ?? null

  const { data, isLoading } = useQuery({
    queryKey: dataKeys.jobsAtCompany(active, 6),
    queryFn: () => jobs.listAtCompany(active, 6),
    enabled: !!active,
    staleTime: DAY_MS,
  })

  const roles = data?.jobs ?? []
  const bars = industries.filter((i) => i.name).slice(0, 5)
  const widest = bars[0]?.count || 1

  return (
    <>
      <article className="lp-uc-card" aria-label="Live company intel">
        <div className="lp-uc-head">
          <span className="lp-card-eyebrow">Live · company intel</span>
          {activeCompany ? (
            <span className="lp-uc-pill" data-tone="accent">
              {formatCount(activeCompany.count)} open
            </span>
          ) : null}
        </div>

        {top.length ? (
          <>
            <h3 className="lp-uc-title">{activeCompany?.name}</h3>

            <ul className="lp-cintel-chips" aria-label="Companies hiring now">
              {top.map((company) => {
                const isActive = company.name === active
                return (
                  <li key={company.name}>
                    <button
                      type="button"
                      className={`lp-cintel-co${isActive ? " is-active" : ""}`}
                      aria-pressed={isActive}
                      onClick={() => setSelected(company.name)}
                    >
                      {company.name}
                      <b>{formatCount(company.count)}</b>
                    </button>
                  </li>
                )
              })}
            </ul>

            {isLoading ? (
              <ul className="lp-cintel-skeleton" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="lp-cintel-shimmer" />
                ))}
              </ul>
            ) : roles.length ? (
              <ol className="lp-uc-rows" aria-label={`Open roles at ${activeCompany?.name ?? ""}`}>
                {roles.map((job) => {
                  const parts = [job.location_city, humanMode(job.location_mode)].filter(Boolean)
                  return (
                    <li key={job.job_id} className="lp-uc-row">
                      <span>
                        <strong>{job.job_title}</strong>
                        <small>{parts.length ? parts.join(" · ") : "—"}</small>
                      </span>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="lp-uc-empty">No open roles on the live mirror right now.</p>
            )}

            <Link className="lp-uc-link" href="/intel">
              See the full live data <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </>
        ) : (
          <p className="lp-uc-empty">Live company data is warming up. Check back shortly.</p>
        )}
      </article>

      <article className="lp-uc-card" aria-label="Live openings by industry">
        <span className="lp-card-eyebrow">Where the demand sits</span>

        {bars.length ? (
          <ol className="lp-demand">
            {bars.map((industry) => (
              <li key={industry.name} className="lp-demand-row">
                <strong>{industry.name}</strong>
                <span className="lp-demand-n">{formatCount(industry.count)}</span>
                <span className="lp-demand-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(4, (industry.count / widest) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="lp-uc-empty">Industry counts are warming up. Check back shortly.</p>
        )}

        <p className="lp-uc-foot">
          {industriesTotal} industries, normalised by live openings, so a count in one is
          comparable with a count in another.
        </p>
      </article>
    </>
  )
}
