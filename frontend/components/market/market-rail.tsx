"use client"

import { useState } from "react"
import type { JobFeedItem, JobPulse } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { useMarketIntel, uncertainListings } from "@/lib/hooks/use-market-intel"
import { CompanySignalRow, CompanyTile } from "@/components/companies/company-signal"
import {
  companySignalHeading,
  companySignalMeta,
  companySignalSortParam,
  type CompanySignalMode,
} from "./company-signals-model"
import "./market-intel.css"

export interface MarketRailProps {
  token: string
  targetLocations: string[]
  feed: JobFeedItem[]
  pulses: Map<string, JobPulse>
  /** Filter the feed to a company (sets the free-text search box). */
  onSeeRoles: (query: string) => void
  /** Filter the feed to a skill (sets the skill facet, not the search box). */
  onFilterSkill: (skill: string) => void
  /** Open a job's detail (where the deliberate verify/report flow lives). */
  onOpenJob: (job: JobFeedItem) => void
  /** @deprecated Skill-demand movers are now the universal market aggregate, not
   *  CV-personalized, so this no longer gates anything. Kept until callers drop
   *  it from the shared rail props. */
  cvReady?: boolean
  /** Wave-3 intent gate (#41 L3): when false the `/jobs/analytics` movers +
   *  trending queries stay unfetched (never fired on login). */
  analyticsEnabled?: boolean
}

/** Desktop right rail — market dashboard + community listing-status. CV-coach
 *  intel lives on /dashboard; this surface stays about the market. */
export function MarketRail(props: MarketRailProps) {
  const { targetLocations, feed, pulses, onSeeRoles, onFilterSkill, onOpenJob, analyticsEnabled = true } = props
  const [companyMode, setCompanyMode] = useState<CompanySignalMode>("roles")
  const { movers, trending, loading: intelLoading } = useMarketIntel(targetLocations, companySignalSortParam(companyMode), analyticsEnabled)
  const uncertain = uncertainListings(feed, pulses)

  // NOTE: no count/scope strip here. The feed summary line ("N roles" + the
  // Location chip) already states both facts one column left, and the chip is
  // the affordance that EDITS them — a second, read-only rendering of the same
  // `total` under a second name ("live roles") is duplicate ink and a second
  // vocabulary for one fact. The rail carries intel the feed can't: movers,
  // who's hiring, listings to verify.
  return (
    <aside className="mi-rail" aria-label="Market intel">
      {/* movers + trending resolve independently of the feed; while their query
          is in flight show the real-shape widget skeletons rather than blank
          (the missing-right-rail root cause). */}
      {intelLoading ? <MarketRailLoading /> : null}

      {/* HERO: the core market lesson */}
      {!intelLoading && movers.length > 0 ? (
        <div className="mi-widget mi-hero">
          <h4 className="mi-h4">Skill-demand movers</h4>
          <p className="mi-sub">What the market is asking for, this month.</p>
          {movers.map((m) => (
            <button key={m.skill} type="button" className="mi-mover" onClick={() => onFilterSkill(m.display)}>
              <span className="mi-mover-n">{m.display}</span>
              <span className="mi-mover-up">↑ {m.jobCount}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* who's hiring in scope */}
      {!intelLoading && trending.length > 0 ? (
        <div className="mi-widget">
          <div className="mi-widget-head">
            <h4 className="mi-h4">{companySignalHeading()}</h4>
            <div className="mi-seg" role="group" aria-label="Company signal sort">
              {(["roles", "scraped"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="mi-seg-btn"
                  aria-pressed={companyMode === mode}
                  onClick={() => setCompanyMode(mode)}
                >
                  {mode === "roles" ? "Roles" : "Scraped"}
                </button>
              ))}
            </div>
          </div>
          <div className="mi-company-list cs-row-list" tabIndex={0} aria-label="Company signals list">
            {trending.map((c) => (
              <CompanySignalRow
                key={c.name}
                name={c.name}
                meta={companySignalMeta(c, companyMode)}
                onClick={() => onSeeRoles(c.name)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* community check — routes to detail (deliberate verify/report lives there) */}
      {uncertain.length > 0 ? (
        <div className="mi-widget mi-verify">
          <h4 className="mi-h4 mi-warn">Community check</h4>
          <p className="mi-sub">{uncertain.length} role{uncertain.length === 1 ? "" : "s"} you saw may be gone. A quick vote keeps the feed honest for everyone.</p>
          {uncertain.map(({ job }) => (
            <button key={job.job_id} type="button" className="mi-vrow" onClick={() => onOpenJob(job)}>
              <CompanyTile name={job.company_name ?? "—"} size="s" />
              <span className="mi-vrow-nm">{job.job_title}{job.company_name ? ` · ${job.company_name}` : ""}</span>
              <span className="mi-vchip">may be closed</span>
            </button>
          ))}
          <p className="mi-foot">Tap a role → vote inside it. Or report any job you can&rsquo;t find after checking its career page.</p>
        </div>
      ) : null}
    </aside>
  )
}

/** Mobile: the rail collapses to a sticky horizontal chip strip. Tap a chip →
 *  the same action its rail widget would route to. */
export function MarketChipStrip(props: MarketRailProps) {
  const { targetLocations, feed, pulses, onSeeRoles, onFilterSkill, onOpenJob, analyticsEnabled = true } = props
  const { movers, trending } = useMarketIntel(targetLocations, "roles", analyticsEnabled)
  const uncertain = uncertainListings(feed, pulses)
  const top = movers[0]
  const co = trending[0]

  // Lead count chip dropped for the same reason as the rail strip — the feed
  // summary line above it already carries the count. Every chip here is a tap.
  return (
    <div className="mi-chipstrip" role="region" aria-label="Market intel">
      {top ? (
        <button type="button" className="mi-chip" onClick={() => onFilterSkill(top.display)}>
          {top.display} <span className="mi-chip-up">↑{top.jobCount}</span>
        </button>
      ) : null}
      {movers[1] ? (
        <button type="button" className="mi-chip" onClick={() => onFilterSkill(movers[1].display)}>
          {movers[1].display} <span className="mi-chip-up">↑{movers[1].jobCount}</span>
        </button>
      ) : null}
      {co ? (
        <button type="button" className="mi-chip" onClick={() => onSeeRoles(co.name)}>
          {co.name} · {co.openCount}
        </button>
      ) : null}
      {uncertain.length > 0 ? (
        <button type="button" className="mi-chip mi-chip-warn" onClick={() => onOpenJob(uncertain[0].job)}>
          Verify {uncertain.length}
        </button>
      ) : null}
    </div>
  )
}

/**
 * Loading shape for the rail's two intel widgets, co-located here so a rail
 * layout change moves it too. Keeps the real headings (so they don't pop in for
 * the common non-empty case) and shimmers the rows over the real `mi-mover` /
 * `cs-row` shapes — content lands in place. Decorative; aria-hidden.
 */
function MarketRailLoading() {
  return (
    <>
      <div className="mi-widget mi-hero" aria-hidden="true">
        <h4 className="mi-h4">Skill-demand movers</h4>
        <p className="mi-sub">What the market is asking for, this month.</p>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="mi-mover">
            <Skeleton style={{ flex: 1, height: 14, borderRadius: 4, maxWidth: `${72 - i * 7}%` }} />
            <Skeleton style={{ width: 34, height: 13, borderRadius: 4, flexShrink: 0 }} />
          </div>
        ))}
      </div>
      <div className="mi-widget" aria-hidden="true">
        <h4 className="mi-h4">{companySignalHeading()}</h4>
        <div className="cs-row-list">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cs-row">
              <Skeleton style={{ width: 26, height: 26, borderRadius: 7, flex: "0 0 auto" }} />
              <Skeleton style={{ flex: 1, height: 14, borderRadius: 4, maxWidth: `${62 - i * 6}%` }} />
              <Skeleton style={{ width: 44, height: 12, borderRadius: 4, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
