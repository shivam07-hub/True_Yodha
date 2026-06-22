"use client"

import { useEffect, useRef, useState } from "react"

import { formatCount } from "@/lib/format"

/** Count-up once on scroll-into-view; static value for reduced motion / no JS. */
function Counter({ target, label }: { target: number; label: string }) {
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
      <div className="lp-stat-num">
        <span>{formatCount(value)}</span>
        <span className="plus">+</span>
      </div>
      <div className="lp-stat-lbl">{label}</div>
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
        <Counter target={jobsTracked} label="Jobs tracked" />
        <Counter target={companiesMonitored} label="Companies monitored" />
        <Counter target={skillsMapped} label="Skills mapped" />
        {seekers !== null ? (
          <Counter target={seekers} label="Job seekers" />
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
