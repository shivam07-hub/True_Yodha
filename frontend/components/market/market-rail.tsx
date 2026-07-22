"use client"

import { useState } from "react"
import type { JobFeedItem, JobPulse } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { useMarketIntel, uncertainListings } from "@/lib/hooks/use-market-intel"
import { useSkillDemand } from "@/lib/hooks/use-skill-demand"
import { SkillDemandPanel } from "./skill-demand-panel"
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
  /** @deprecated Skill demand is the universal market aggregate, not
   *  CV-personalized, so this no longer gates anything. Kept until callers drop
   *  it from the shared rail props. */
  cvReady?: boolean
  /** Wave-3 intent gate (#41 L3): when false the skill-demand + trending queries
   *  stay unfetched (never fired on login). */
  analyticsEnabled?: boolean
}

/** Desktop right rail — market dashboard + community listing-status. CV-coach
 *  intel lives on /dashboard; this surface stays about the market. */
export function MarketRail(props: MarketRailProps) {
  const { targetLocations, feed, pulses, onSeeRoles, onFilterSkill, onOpenJob, analyticsEnabled = true } = props
  const [companyMode, setCompanyMode] = useState<CompanySignalMode>("roles")
  const { trending, loading: intelLoading } = useMarketIntel(targetLocations, companySignalSortParam(companyMode), analyticsEnabled)
  const homeCity = targetLocations.find((l) => l && l.trim())?.trim() ?? null
  const uncertain = uncertainListings(feed, pulses)

  // NOTE: no count/scope strip here. The feed summary line ("N roles" + the
  // Location chip) already states both facts one column left, and the chip is
  // the affordance that EDITS them — a second, read-only rendering of the same
  // `total` under a second name ("live roles") is duplicate ink and a second
  // vocabulary for one fact. The rail carries intel the feed can't: skill
  // demand, who's hiring, listings to verify.
  return (
    <aside className="mi-rail" aria-label="Market intel">
      {/* HERO: the core market lesson. Owns its own loading/empty state — it
          reads the skill-demand snapshot, not the /jobs/analytics scan the
          trending widget below still uses. */}
      <SkillDemandPanel
        homeCity={homeCity}
        onFilterSkill={onFilterSkill}
        enabled={analyticsEnabled}
      />

      {/* trending resolves independently of the feed; while its query is in
          flight show the real-shape widget skeleton rather than blank (the
          missing-right-rail root cause). */}
      {intelLoading ? <MarketRailLoading /> : null}

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
  const { trending } = useMarketIntel(targetLocations, "roles", analyticsEnabled)
  const uncertain = uncertainListings(feed, pulses)
  const co = trending[0]
  // Mobile takes the 30d window in the viewer's own city — no picker in a chip
  // strip. A city we hold no snapshot for yields no chips rather than a chip
  // built from a number we cannot stand behind.
  const city = targetLocations.find((l) => l && l.trim())?.trim() ?? null
  const { skills } = useSkillDemand(city, "30d", analyticsEnabled, 2)

  // Lead count chip dropped for the same reason as the rail strip — the feed
  // summary line above it already carries the count. Every chip here is a tap.
  return (
    <div className="mi-chipstrip" role="region" aria-label="Market intel">
      {skills.map((s) => (
        <button
          key={s.skill}
          type="button"
          className="mi-chip"
          onClick={() => onFilterSkill(s.skill)}
        >
          {s.skill} <span className="mi-chip-up">{s.roles}</span>
        </button>
      ))}
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
 * Loading shape for the trending widget, co-located here so a rail layout change
 * moves it too. Keeps the real heading (so it doesn't pop in for the common
 * non-empty case) and shimmers rows over the real `cs-row` shape — content lands
 * in place. The skill-demand panel owns its own skeleton. Decorative; aria-hidden.
 */
function MarketRailLoading() {
  return (
    <>
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
