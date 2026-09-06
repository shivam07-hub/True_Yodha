"use client"

/**
 * Hiring by sector, above the heatmap.
 *
 * The heatmap answers "which of my skills does each company I follow want",
 * which needs a CV, a skill map and followed companies. This answers "where is
 * hiring happening at all", which needs none of them — so it sits ABOVE the
 * CV-prerequisite branch and is the one thing on this page that works for
 * somebody who signed up ten minutes ago.
 *
 * The panel itself has been public and indexed since it shipped, and reachable
 * only from a footer the authed shell does not render. This is the connection
 * it never had.
 *
 * Compact on purpose: the heatmap is the main event here. Four figures per
 * sector and a door to the full panel.
 */

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"
import { hiringPanel } from "@/lib/api"
import { formatCount } from "@/lib/format"
import "./sector-band.css"

/** Never rounds into a boundary it did not reach. */
function pct(rate: number | null): string {
  if (rate === null) return "—"
  if (rate === 1) return "100%"
  if (rate === 0) return "0%"
  return `${Math.min(99, Math.max(1, Math.round(rate * 100)))}%`
}

export function SectorBand() {
  const { data } = useQuery({
    queryKey: ["hiring-panel"],
    queryFn: () => hiringPanel.get(),
    staleTime: 60 * 60 * 1000,
  })

  // Nothing on failure or while loading. A band that pops in above content the
  // reader has started is worse than one that arrives with the page, and a
  // broken band is worse than no band.
  if (!data?.sectors?.length) return null

  return (
    <section className="sb" aria-labelledby="sb-title">
      <header className="sb-head">
        <h2 id="sb-title" className="sb-title">Where hiring is happening</h2>
        <Link className="sb-more tm-control-focus" href="/hiring">
          All sectors <ArrowRight size={13} aria-hidden />
        </Link>
      </header>

      <ul className="sb-list">
        {data.sectors.slice(0, 6).map((s) => (
          <li key={s.sector} className="sb-item">
            <span className="sb-name">{s.sector}</span>
            <span className="sb-figs">
              <span className="sb-fig">
                <b>{formatCount(s.live_roles)}</b> live
              </span>
              <span className="sb-fig">
                <b>{pct(s.new_share)}</b> new in 30d
              </span>
              <span className="sb-fig" title="Closed roles the employer left advertised">
                <b>{pct(s.still_advertised_rate)}</b> still up after closing
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
