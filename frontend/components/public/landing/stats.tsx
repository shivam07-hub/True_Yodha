"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

import { formatCount } from "@/lib/format"

/** Count-up once on scroll-into-view; static value for reduced motion / no JS.
 *
 *  `href` makes the tile a way in rather than a claim: a number this big is only
 *  believable if the reader can go and look at what it counts. Rendered as a
 *  real <Link> so it is crawlable and middle-clickable, not a click handler. */
function Counter({ target, label, href }: { target: number; label: string; href: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(target)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce || !("IntersectionObserver" in window)) {
      setValue(target)
      return
    }
    setValue(0)
    let raf = 0
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          io.unobserve(entry.target)
          const DUR = 800
          let start: number | null = null
          const frame = (ts: number) => {
            if (start === null) start = ts
            const p = Math.min((ts - start) / DUR, 1)
            const eased = 1 - Math.pow(1 - p, 3)
            setValue(Math.round(target * eased))
            if (p < 1) raf = requestAnimationFrame(frame)
          }
          raf = requestAnimationFrame(frame)
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [target])

  return (
    <div className="lp-stat" ref={ref}>
      <Link href={href} className="lp-stat-link tm-control-focus">
        <div className="lp-stat-num">
          <span>{formatCount(value)}</span>
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
        <Counter target={companiesMonitored} label="Companies monitored" href="/companies" />
        <Counter target={skillsMapped} label="Skills mapped" href="/intel" />
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
