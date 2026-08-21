"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, TrendingUp } from "lucide-react"
import type { NameCountItem, SkillCountItem } from "@/lib/api"
import { formatCount } from "@/lib/format"

/** Fill opacity steps down as rank descends, so the ranking is legible before
 *  a single count is read (handoff §4, "Bar"). */
const RANK_OPACITY = [1, 0.75, 0.6, 0.5, 0.4]

/** Tab 04 keeps the handoff's card structure and fills it from live analytics
 *  rather than the mock's literals: `by_company` for the picker and its counts,
 *  `top_skills` for the skill pills, `by_industry` for the bars. Nothing here
 *  is invented, so no card carries a "sample" eyebrow — the two stat cells are
 *  the two facts `by_company` actually supports (the mock's third, a 2–4y
 *  experience band, has no source anywhere in the corpus). */
export function LandingIntelSample({
  companies,
  industries,
  topSkills,
}: {
  companies: NameCountItem[]
  industries: NameCountItem[]
  topSkills: SkillCountItem[]
}) {
  const top = companies.filter((c) => c.name).slice(0, 8)
  // Derive the active company so it resolves to the first entry once the async
  // analytics land (companies is [] on the first render) — no effect needed.
  const [selected, setSelected] = useState<string>("")
  const active = selected || top[0]?.name || ""
  const rank = Math.max(0, top.findIndex((c) => c.name === active))
  const activeCompany = top[rank] ?? null

  const skills = topSkills.filter((s) => s.skill).slice(0, 5)
  const bars = industries.filter((i) => i.name).slice(0, 5)
  const widest = bars[0]?.count || 1

  return (
    <>
      <article className="lp-uc-card" aria-label="Live company intel">
        <div className="lp-uc-head">
          <span className="lp-card-eyebrow">live intel · {active || "loading"}</span>
          {activeCompany ? (
            <span className="lp-uc-pill" data-tone="success">
              <TrendingUp size={12} strokeWidth={1.8} aria-hidden="true" /> hiring
            </span>
          ) : null}
        </div>

        {top.length ? (
          <>
            <h3 className="lp-uc-title">What {activeCompany?.name} is hiring for</h3>

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
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="lp-uc-stats">
              <div className="lp-uc-stat" data-focus="true">
                <b>{formatCount(activeCompany?.count ?? 0)}</b>
                <span>open roles</span>
              </div>
              <div className="lp-uc-stat">
                <b>#{rank + 1}</b>
                <span>by volume</span>
              </div>
            </div>

            {skills.length ? (
              <>
                <h4 className="lp-cintel-sub">most-asked skills · market-wide</h4>
                <div className="lp-uc-chips">
                  {skills.map((item, index) => (
                    <span
                      key={item.skill}
                      className="lp-uc-pill"
                      data-tone={index === 0 ? "solid" : undefined}
                    >
                      {item.skill} · {formatCount(item.count)}
                    </span>
                  ))}
                </div>
              </>
            ) : null}

            <div className="lp-uc-spacer" aria-hidden="true" />

            <Link className="lp-uc-link" href="/intel">
              see the full live data <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </>
        ) : (
          <p className="lp-uc-empty">Live company data is warming up — check back shortly.</p>
        )}
      </article>

      <article className="lp-uc-card" aria-label="Live openings by industry">
        <span className="lp-card-eyebrow">where the demand sits</span>

        {bars.length ? (
          <ol className="lp-demand">
            {bars.map((industry, index) => (
              <li key={industry.name} className="lp-demand-row">
                <strong>{industry.name}</strong>
                <span className="lp-demand-n">{formatCount(industry.count)}</span>
                <span className="lp-uc-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.max(4, (industry.count / widest) * 100)}%`,
                      opacity: RANK_OPACITY[index],
                    }}
                  />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="lp-uc-empty">Industry counts are warming up — check back shortly.</p>
        )}

        <div className="lp-uc-spacer" aria-hidden="true" />

        <p className="lp-uc-foot">
          Normalised across every tracked industry, so a count in one is comparable with a count
          in another.
        </p>
      </article>
    </>
  )
}
