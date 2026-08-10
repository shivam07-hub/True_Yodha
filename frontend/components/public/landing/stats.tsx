import Link from "next/link"

import { formatCount } from "@/lib/format"

function Counter({ target, label, href }: { target: number; label: string; href: string }) {
  return (
    <div className="lp-stat">
      <Link href={href} className="lp-stat-link tm-control-focus">
        <div className="lp-stat-num">
          <span>{formatCount(target)}</span>
          <span className="plus">+</span>
        </div>
        <div className="lp-stat-lbl">{label}</div>
      </Link>
    </div>
  )
}

interface LandingStatsProps {
  jobsTracked: number
  companiesMonitored: number
  skillsMapped: number
  /** Real seeker count, or null. Null → non-numeric proof tile, never a fake
   *  number (T3 / PV1). The three corpus counts above are real engine scale. */
  seekers: number | null
}

/** Credibility strip at the very top of the page — the live Engine corpus, made
 *  loud where the user actually starts reading (was buried mid-page in S2).
 *  The fourth tile is social proof: a real seeker count when one is configured,
 *  otherwise an honest non-numeric line (no fabricated user totals). */
export function LandingStats({ jobsTracked, companiesMonitored, skillsMapped, seekers }: LandingStatsProps) {
  return (
    <div className="lp-stats" aria-label="Myro, by the numbers">
      <div className="lp-wrap lp-stats-row">
        <Counter target={jobsTracked} label="Jobs tracked" href="/market" />
        <Counter target={companiesMonitored} label="Career pages monitored" href="/companies" />
        <Counter target={skillsMapped} label="Skills read from jobs" href="/intel" />
        {seekers !== null ? (
          /* No destination — a seeker count has no page to open, and a tile
             that looks clickable but only reloads the landing page is worse
             than one that plainly is not. */
          <div className="lp-stat">
            <div className="lp-stat-num">
              <span>{formatCount(seekers)}</span>
              <span className="plus">+</span>
            </div>
            <div className="lp-stat-lbl">Job seekers</div>
          </div>
        ) : (
          <div className="lp-stat lp-stat-proof">
            <div className="lp-stat-proof-line">Built in India</div>
            <div className="lp-stat-lbl">for job seekers</div>
          </div>
        )}
      </div>
    </div>
  )
}
