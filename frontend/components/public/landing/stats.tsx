"use client"

import { useEffect, useRef, useState } from "react"

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
        <span>{value.toLocaleString("en-US")}</span>
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
  seekers: number
}

/** Credibility strip at the very top of the page — the live Engine corpus, made
 *  loud where the user actually starts reading (was buried mid-page in S2). */
export function LandingStats({ jobsTracked, companiesMonitored, skillsMapped, seekers }: LandingStatsProps) {
  return (
    <div className="lp-stats" aria-label="Myro, by the numbers">
      <div className="lp-wrap lp-stats-row">
        <Counter target={jobsTracked} label="Jobs tracked" />
        <Counter target={companiesMonitored} label="Companies monitored" />
        <Counter target={skillsMapped} label="Skills mapped" />
        <Counter target={seekers} label="Job seekers" />
      </div>
    </div>
  )
}
