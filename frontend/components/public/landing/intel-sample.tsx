"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"
import { jobs } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

const DAY_MS = 24 * 60 * 60 * 1000

function humanMode(raw?: string | null): string {
  const value = (raw || "").toLowerCase().trim()
  if (value === "remote") return "Remote"
  if (value === "hybrid") return "Hybrid"
  if (value === "onsite" || value === "on-site") return "On-site"
  return "—"
}

/** Tab 04 is the one panel that is genuinely live: real open roles per company,
 *  read from the public `/jobs/at/{company}` endpoint. No fit % here — that
 *  needs an uploaded CV — only real titles, locations and counts. */
export function LandingIntelSample({
  companies,
}: {
  companies: { name: string; count: number }[]
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

  if (!top.length) {
    return (
      <div className="lp-cintel">
        <p className="lp-card-eyebrow">live · company intel</p>
        <p className="lp-cintel-empty">Live company data is warming up — check back shortly.</p>
      </div>
    )
  }

  const roles = data?.jobs ?? []

  return (
    <div className="lp-cintel">
      <p className="lp-card-eyebrow">live · company intel</p>

      <div className="lp-cintel-grid">
        <ul className="lp-cintel-list" aria-label="Companies hiring now">
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
                  <span className="lp-cintel-co-name">{company.name}</span>
                  <span className="lp-cintel-co-count">{company.count}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="lp-cintel-roles">
          <div className="lp-cintel-roles-head">
            <strong>Open roles · {activeCompany?.name}</strong>
            {activeCompany ? (
              <span className="lp-cintel-roles-n">{roles.length} of {activeCompany.count}</span>
            ) : null}
          </div>

          {isLoading ? (
            <ul className="lp-cintel-skeleton" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="lp-cintel-shimmer" />
              ))}
            </ul>
          ) : roles.length ? (
            <ul className="lp-cintel-role-list" aria-label={`Open roles at ${activeCompany?.name ?? ""}`}>
              {roles.map((job) => {
                const mode = humanMode(job.location_mode)
                const parts = [job.location_city, mode === "—" ? null : mode].filter(Boolean)
                return (
                  <li key={job.job_id} className="lp-cintel-role">
                    <strong>{job.job_title}</strong>
                    <small>{parts.length ? parts.join(" · ") : "—"}</small>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="lp-cintel-empty">No open roles on the live mirror right now.</p>
          )}

          <Link className="lp-cintel-more" href="/intel">
            See the full live data <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}
