"use client"

import { IntelHero } from "@/components/public/intel/intel-hero"
import { useScraperUptime } from "@/components/public/intel/intel-filters"
import type { MarketAnalytics } from "@/lib/api"
import "@/components/public/intel-pane.css"
import "./landing-live-mirror.css"

/** Landing mirror of the /intel live-scrape hero — same component, same real
 *  analytics query the rest of the landing page already fetches. Sits above
 *  "Tailor for the job" (handoff 2026-08-13) as live proof before the pitch.
 *  IntelHero normally relies on its parent .tm-intel-page for max-width +
 *  page padding; landing has no such ancestor, so this frames it the same
 *  way every other landing section frames its content (.lp-wrap + section
 *  rhythm), matching the rest of the page instead of bleeding edge-to-edge. */
export function LandingLiveMirror({
  analytics,
  jobsCount,
  companiesCount,
}: {
  analytics: MarketAnalytics | null
  jobsCount: number
  companiesCount: number
}) {
  const uptime = useScraperUptime(analytics?.scraper_started)

  return (
    <div className="lp-live-mirror">
      <div className="lp-wrap">
        <IntelHero
          jobsCount={jobsCount}
          jobsTick={false}
          companiesCount={companiesCount}
          industriesCount={analytics?.total_industries || 10}
          parsedToday={analytics?.total_jobs_today ?? 0}
          jobsAdded1h={analytics?.jobs_added_1h ?? 0}
          companiesAdded7d={analytics?.companies_added_7d ?? 0}
          latestBatchIso={analytics?.latest_batch ?? null}
          consoleCompanies={analytics?.by_company ?? []}
          uptime={uptime}
        />
      </div>
    </div>
  )
}
