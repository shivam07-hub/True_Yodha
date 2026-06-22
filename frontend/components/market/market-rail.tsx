"use client"

import type { CSSProperties } from "react"
import type { JobFeedItem, JobPulse } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { useMarketIntel, uncertainListings } from "@/lib/hooks/use-market-intel"
import { formatCount } from "@/lib/format"
import "./market-intel.css"

export interface MarketRailProps {
  token: string
  targetLocations: string[]
  total: number
  feed: JobFeedItem[]
  pulses: Map<string, JobPulse>
  /** Filter the feed to a company (sets the free-text search box). */
  onSeeRoles: (query: string) => void
  /** Filter the feed to a skill (sets the skill facet, not the search box). */
  onFilterSkill: (skill: string) => void
  /** Open a job's detail (where the deliberate verify/report flow lives). */
  onOpenJob: (job: JobFeedItem) => void
  /** Feed still resolving — strip shows a shimmer, never a literal "0". */
  loading?: boolean
  /** @deprecated Skill-demand movers are now the universal market aggregate, not
   *  CV-personalized, so this no longer gates anything. Kept until callers drop
   *  it from the shared rail props. */
  cvReady?: boolean
}

/** Desktop right rail — market dashboard + community listing-status. CV-coach
 *  intel lives on /dashboard; this surface stays about the market. */
export function MarketRail(props: MarketRailProps) {
  const { targetLocations, total, feed, pulses, onSeeRoles, onFilterSkill, onOpenJob, loading = false } = props
  const { movers, trending, loading: intelLoading } = useMarketIntel(targetLocations)
  const city = targetLocations.find((l) => l && l.trim())?.trim() ?? null
  const uncertain = uncertainListings(feed, pulses)

  return (
    <aside className="mi-rail" aria-label="Market intel">
      {/* thin scope strip — real live-role count, no fabricated daily delta.
          While the feed is still loading the number is a shimmer, not "0" — a
          literal zero here reads as "no jobs", the opposite of the truth. */}
      <div className="mi-strip mi-widget">
        {loading ? (
          <Skeleton style={{ width: 104, height: 22, borderRadius: 6 }} />
        ) : (
          <>
            <span className="mi-strip-num">{formatCount(total)}</span>
            <span className="mi-strip-sub">live role{total === 1 ? "" : "s"}{city ? ` · ${city}` : ""}</span>
          </>
        )}
      </div>

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
  const { targetLocations, total, feed, pulses, onSeeRoles, onFilterSkill, onOpenJob } = props
  const { movers, trending } = useMarketIntel(targetLocations)
  const uncertain = uncertainListings(feed, pulses)
  const top = movers[0]
  const co = trending[0]

  return (
    <div className="mi-chipstrip" role="region" aria-label="Market intel">
      <span className="mi-chip mi-chip-lead">{formatCount(total)} live</span>
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
 * `mi-tco` classes — content lands in place. Decorative; aria-hidden.
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
        <h4 className="mi-h4">Trending companies</h4>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mi-tco">
            <Skeleton style={{ width: 30, height: 30, borderRadius: 8, flex: "0 0 auto" }} />
            <Skeleton style={{ flex: 1, height: 14, borderRadius: 4, maxWidth: `${62 - i * 6}%` }} />
            <Skeleton style={{ width: 44, height: 12, borderRadius: 4, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </>
  )
}

function logoBg(company: string | null): CSSProperties {
  if (!company) return {}
  let h = 0
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) % 360
  return { background: `hsl(${h} 52% 42%)`, color: "#fff" }
}
