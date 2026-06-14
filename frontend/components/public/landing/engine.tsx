"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Globe, Sparkles, Network, Target, FileText, type LucideIcon } from "lucide-react"

interface Stage {
  num: string
  title: string
  meta: string
  Icon: LucideIcon
}

function StageCard({ stage, className }: { stage: Stage; className?: string }) {
  const { Icon } = stage
  return (
    <div className={`lp-stage${className ? ` ${className}` : ""}`}>
      <div className="lp-stage-top">
        <span className="lp-stage-icon" aria-hidden>
          <Icon size={20} strokeWidth={1.5} />
        </span>
        <span className="lp-stage-num">STAGE {stage.num}</span>
      </div>
      <div className="lp-stage-title">{stage.title}</div>
      <p className="lp-stage-meta">{stage.meta}</p>
    </div>
  )
}

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
    <div className="lp-counter" ref={ref}>
      <div className="lp-counter-num">
        <span>{value.toLocaleString("en-US")}</span>
        <span className="plus">+</span>
      </div>
      <div className="lp-counter-lbl">{label}</div>
    </div>
  )
}

interface LandingEngineProps {
  companiesLabel: string
  jobsTracked: number
  companiesMonitored: number
  skillsMapped: number
  seekers: number
}

export function LandingEngine({
  companiesLabel,
  jobsTracked,
  companiesMonitored,
  skillsMapped,
  seekers,
}: LandingEngineProps) {
  const stages: Stage[] = [
    {
      num: "01",
      title: "Career pages, read live",
      meta: `${companiesLabel} MNC career portals, tracked continuously`,
      Icon: Globe,
    },
    {
      num: "02",
      title: "AI enrichment",
      meta: "Every posting cleaned, summarized, skill-tagged",
      Icon: Sparkles,
    },
    {
      num: "03",
      title: "Skill taxonomy",
      meta: "32,000+ skills · levels L1–L5",
      Icon: Network,
    },
    {
      num: "05",
      title: "Match · Score · Tailor",
      meta: "Best-fit roles ranked · one CV version per job",
      Icon: Target,
    },
  ]

  return (
    <section className="lp-engine" id="engine" aria-label="The Myro Engine">
      <div className="lp-grid-bg" aria-hidden />

      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <Image
            src="/brand/myro-mark.png"
            alt="Myro"
            width={40}
            height={40}
            className="lp-eyebrow-logo"
            priority
          />
          <h2 className="lp-section-title">One pipeline runs everything on Myro.</h2>
          <p className="lp-section-sub">
            The Myro Engine reads the market continuously. Every product on this page is a
            different window into the same machine.
          </p>
        </div>

        <div className="lp-pipeline lp-reveal">
          <div className="lp-flow-h f1" aria-hidden />
          <div className="lp-flow-h f2" aria-hidden />
          <div className="lp-flow-h f3" aria-hidden />
          {stages.map((stage) => (
            <StageCard key={stage.num} stage={stage} />
          ))}
        </div>

        <div className="lp-pipeline-merge lp-reveal">
          <div className="lp-flow-v" aria-hidden />
          <p className="lp-merge-note">
            <strong>Your CV joins the stream.</strong> The Engine isn&rsquo;t just market data —
            it&rsquo;s market data meeting your CV.
          </p>
          <StageCard
            className="lp-stage-cv"
            stage={{
              num: "04",
              title: "Your CV",
              meta: "Skills extracted · scored across 10 career domains",
              Icon: FileText,
            }}
          />
        </div>

        <div className="lp-counters lp-reveal" aria-label="Live Engine counters">
          <Counter target={jobsTracked} label="Jobs tracked" />
          <Counter target={companiesMonitored} label="Companies monitored" />
          <Counter target={skillsMapped} label="Skills mapped" />
          <Counter target={seekers} label="Job seekers" />
        </div>

        <p className="lp-roadmap-line lp-reveal">
          In development: referral paths into the companies you target.
        </p>
      </div>
    </section>
  )
}
