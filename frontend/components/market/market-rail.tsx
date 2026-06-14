"use client"

import type { CSSProperties } from "react"
import type { JobFeedItem, JobPulse } from "@/lib/api"
import { useMarketIntel, uncertainListings } from "@/lib/hooks/use-market-intel"
import "./market-intel.css"

export interface MarketRailProps {
  token: string
  targetLocations: string[]
  total: number
  feed: JobFeedItem[]
  pulses: Map<string, JobPulse>
  /** Filter the feed to a skill or company (sets the search box). */
  onSeeRoles: (query: string) => void
  /** Open a job's detail (where the deliberate verify/report flow lives). */
  onOpenJob: (job: JobFeedItem) => void
}

/** Desktop right rail — market dashboard + community listing-status. CV-coach
 *  intel lives on /dashboard; this surface stays about the market. */
export function MarketRail(props: MarketRailProps) {
  const { token, targetLocations, total, feed, pulses, onSeeRoles, onOpenJob } = props
  const { movers, trending } = useMarketIntel(token, targetLocations)
  const city = targetLocations.find((l) => l && l.trim())?.trim() ?? null
  const uncertain = uncertainListings(feed, pulses)

  return (
    <aside className="mi-rail" aria-label="Market intel">
      {/* thin scope strip — real live-role count, no fabricated daily delta */}
      <div className="mi-widget mi-strip">
        <span className="mi-strip-num">{total.toLocaleString()}</span>
        <span className="mi-strip-sub">live role{total === 1 ? "" : "s"}{city ? ` · ${city}` : ""}</span>
      </div>

      {/* HERO: the core market lesson */}
      {movers.length > 0 ? (
        <div className="mi-widget mi-hero">
          <h4 className="mi-h4">Skill-demand movers</h4>
          <p className="mi-sub">What the market is asking for, this month.</p>
          {movers.map((m) => (
            <button key={m.skill} type="button" className="mi-mover" onClick={() => onSeeRoles(m.display)}>
              <span className="mi-mover-n">{m.display}</span>
              <span className="mi-mover-up">↑ {m.jobCount}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* who's hiring in scope */}
      {trending.length > 0 ? (
        <div className="mi-widget">
          <h4 className="mi-h4">Trending companies</h4>
          {trending.map((c) => (
            <button key={c.name} type="button" className="mi-tco" onClick={() => onSeeRoles(c.name)}>
              <span className="mi-tco-lg" style={logoBg(c.name)} aria-hidden>{c.name.slice(0, 1)}</span>
              <span className="mi-tco-nm">{c.name}</span>
              <span className="mi-tco-ct">{c.openCount} role{c.openCount === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* community check — routes to detail (deliberate verify/report lives there) */}
      {uncertain.length > 0 ? (
        <div className="mi-widget mi-verify">
          <h4 className="mi-h4 mi-warn">Community check</h4>
          <p className="mi-sub">{uncertain.length} role{uncertain.length === 1 ? "" : "s"} you saw may be gone. A quick vote keeps the feed honest for everyone.</p>
          {uncertain.map(({ job }) => (
            <button key={job.job_id} type="button" className="mi-vrow" onClick={() => onOpenJob(job)}>
              <span className="mi-tco-lg mi-vlg" style={logoBg(job.company_name)} aria-hidden>{(job.company_name ?? "—").slice(0, 1)}</span>
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
  const { token, targetLocations, total, feed, pulses, onSeeRoles, onOpenJob } = props
  const { movers, trending } = useMarketIntel(token, targetLocations)
  const uncertain = uncertainListings(feed, pulses)
  const top = movers[0]
  const co = trending[0]

  return (
    <div className="mi-chipstrip" role="region" aria-label="Market intel">
      <span className="mi-chip mi-chip-lead">{total.toLocaleString()} live</span>
      {top ? (
        <button type="button" className="mi-chip" onClick={() => onSeeRoles(top.display)}>
          {top.display} <span className="mi-chip-up">↑{top.jobCount}</span>
        </button>
      ) : null}
      {movers[1] ? (
        <button type="button" className="mi-chip" onClick={() => onSeeRoles(movers[1].display)}>
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

function logoBg(company: string | null): CSSProperties {
  if (!company) return {}
  let h = 0
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) % 360
  return { background: `hsl(${h} 52% 42%)`, color: "#fff" }
}
