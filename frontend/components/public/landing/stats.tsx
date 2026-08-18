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
}

/** Credibility strip at the very top of the page — the live Engine corpus, made
 *  loud where the user actually starts reading. The fourth tile is the project
 *  itself: open source, MIT, forkable — proof over a fabricated user total. */
export function LandingStats({ jobsTracked, companiesMonitored, skillsMapped }: LandingStatsProps) {
  return (
    <div className="lp-stats" aria-label="Myro, by the numbers">
      <div className="lp-wrap lp-stats-row">
        <Counter target={jobsTracked} label="Jobs tracked" href="/intel" />
        <Counter target={companiesMonitored} label="Career pages monitored" href="/companies" />
        <Counter target={skillsMapped} label="Skills read from jobs" href="/intel" />
        <a
          href="https://github.com/shivam07-hub/True_Yodha"
          target="_blank"
          rel="noreferrer"
          className="lp-stat lp-stat-link lp-stat-oss tm-control-focus"
        >
          <div className="lp-stat-oss-num">open source</div>
          <div className="lp-stat-lbl">MIT · fork freely</div>
        </a>
      </div>
    </div>
  )
}
