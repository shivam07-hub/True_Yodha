"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { LOG_SEEDS, fmtBatch, fmtNum, type LogSeed } from "./intel-data"

interface HeroProps {
  jobsCount: number
  jobsTick: boolean
  companiesCount: number
  industriesCount: number
  industriesMapped?: number
  parsedToday?: number
  jobsAdded1h?: number
  companiesAdded7d?: number
  latestBatchIso?: string | null
  uptime: string
}

export function IntelHero(props: HeroProps) {
  return (
    <section className="tm-intel-mc">
      <div className="tm-intel-mc-headline">
        <div className="tm-intel-eyebrow">
          <span className="tm-intel-live-dot" />
          <span className="tm-intel-eyebrow-accent">LIVE · PUBLIC MIRROR</span>
        </div>
        <h1 className="tm-intel-display">
          Every careers page,{" "}
          <em>on one platform.</em>
        </h1>
        <p className="tm-intel-lede">
          A self-hosted, open-source model has been fetching job listings for{" "}
          <span className="tm-intel-ink">{props.uptime}</span>.
        </p>

        <HeroStats
          jobs={props.jobsCount}
          tick={props.jobsTick}
          companies={props.companiesCount}
          industries={props.industriesCount}
          mapped={props.industriesMapped ?? props.industriesCount}
          jobsAdded1h={props.jobsAdded1h ?? 0}
          companiesAdded7d={props.companiesAdded7d ?? 0}
          latestBatchIso={props.latestBatchIso ?? null}
        />

        <HeroCtas />
      </div>

      <Console parsedToday={props.parsedToday ?? 0} />
    </section>
  )
}

function HeroStats({
  jobs, tick, companies, industries, jobsAdded1h, companiesAdded7d, latestBatchIso,
}: {
  jobs: number; tick: boolean; companies: number; industries: number; mapped: number
  jobsAdded1h: number; companiesAdded7d: number; latestBatchIso: string | null
}) {
  const batchLabel = latestBatchIso ? `batch ${fmtBatch(latestBatchIso)}` : "live mirror"
  return (
    <div className="tm-intel-stats">
      <div className="tm-intel-stat">
        <div className="tm-intel-stat-num">
          {fmtNum(jobs)}
          <span className={"tm-intel-stat-tick" + (tick ? " is-show" : "")}>+1</span>
        </div>
        <div className="tm-intel-stat-lbl">Jobs indexed</div>
        <div className="tm-intel-stat-delta">
          {jobsAdded1h > 0 ? `↑ ${fmtNum(jobsAdded1h)} in last hour` : batchLabel}
        </div>
      </div>
      <div className="tm-intel-stat">
        <div className="tm-intel-stat-num">{fmtNum(companies)}</div>
        <div className="tm-intel-stat-lbl">Companies</div>
        <div className="tm-intel-stat-delta">
          {companiesAdded7d > 0 ? `↑ ${companiesAdded7d} new this week` : "stable this week"}
        </div>
      </div>
      <div className="tm-intel-stat">
        <div className="tm-intel-stat-num">{fmtNum(industries)}</div>
        <div className="tm-intel-stat-lbl">Industries</div>
        <div className="tm-intel-stat-delta is-muted">
          {industries} indexed · normalised
        </div>
      </div>
    </div>
  )
}

const GITHUB_REPO = "shivam07-hub/True_Yodha"
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`

function HeroCtas() {
  const signup = useSignupGate()

  return (
    <div className="tm-intel-ctas">
      <Link
        href="/signup?next=/cv?upload=1"
        className="tm-intel-btn-primary"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
          e.preventDefault()
          signup.open({ surface: "manual", next: "/cv?upload=1", source: "intel_hero_signup" })
        }}
      >
        Sign up to track your CV
        <span className="tm-intel-arrow">→</span>
      </Link>
      <a
        className="tm-intel-btn-github"
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Open Myro on GitHub"
        title="Open Myro on GitHub"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.18c-3.2.69-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.27-5.24-5.67 0-1.25.45-2.27 1.19-3.07-.12-.29-.51-1.47.11-3.07 0 0 .97-.31 3.17 1.17.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.48 3.17-1.17 3.17-1.17.62 1.6.23 2.78.11 3.07.74.8 1.19 1.82 1.19 3.07 0 4.41-2.7 5.37-5.27 5.65.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
        </svg>
      </a>
    </div>
  )
}

interface LogEntry extends LogSeed { id: number; t: string }

const CONSOLE_BASE_MS = Date.UTC(2026, 5, 5, 22, 45, 51)

function stamp(offsetSec: number, baseMs: number): string {
  const d = new Date(baseMs - Math.round(offsetSec * 1000))
  return d.toISOString().slice(11, 19)
}

function Console({ parsedToday }: { parsedToday: number }) {
  const [entries, setEntries] = useState<LogEntry[]>(() =>
    LOG_SEEDS.slice(0, 9).reverse().map((e, i) => ({ ...e, id: i, t: stamp(i * 1.2, CONSOLE_BASE_MS) })),
  )
  const [gpu, setGpu] = useState(87)
  const [tps, setTps] = useState(184)
  const idRef = useRef(100)

  useEffect(() => {
    const id = setInterval(() => {
      const seed = LOG_SEEDS[Math.floor(Math.random() * LOG_SEEDS.length)]
      const next: LogEntry = { ...seed, id: idRef.current++, t: stamp(0, Date.now()) }
      setEntries((prev) => [...prev.slice(-8), next])
      setGpu(() => 78 + Math.round(Math.random() * 18))
      setTps(() => 150 + Math.round(Math.random() * 90))
    }, 1700)
    return () => clearInterval(id)
  }, [])

  return (
    <aside className="tm-intel-console" aria-label="LLM runner live log">
      <div className="tm-intel-console-head">
        <span className="tm-intel-status-dot" />
        <span className="tm-intel-console-title">
          LLM RUNNER<span className="tm-intel-console-ver"> · gpt-oss-120b</span>
        </span>
        <div className="tm-intel-spacer" />
        <div className="tm-intel-gpu">
          <span>GPU</span>
          <div className="tm-intel-gpu-bar"><div style={{ width: `${gpu}%` }} /></div>
          <span className="tm-intel-gpu-val">{gpu}%</span>
        </div>
      </div>

      <div className="tm-intel-log">
        {entries.map((e) => (
          <div className="tm-intel-log-entry" key={e.id}>
            <span className="tm-intel-log-t">{e.t}</span>
            <span className={`tm-intel-log-op is-${e.op}`}>{e.op}</span>
            <span className="tm-intel-log-path">
              <span className="tm-intel-log-arrow">↳</span>
              {e.path}
            </span>
            <span className="tm-intel-log-meta">
              {e.meta.includes("ok")
                ? <>{e.meta.replace("ok", "")}<span className="tm-intel-log-ok">ok</span></>
                : e.meta}
            </span>
          </div>
        ))}
      </div>

      <div className="tm-intel-console-foot">
        <div className="tm-intel-kpi">
          <span className="tm-intel-kpi-lab">Throughput</span>
          <span className="tm-intel-kpi-val">{tps}<span className="tm-intel-kpi-unit">tok/s</span></span>
        </div>
        <div className="tm-intel-kpi">
          <span className="tm-intel-kpi-lab">Parsed today</span>
          <span className="tm-intel-kpi-val">
            {fmtNum(parsedToday)}<span className="tm-intel-kpi-unit">jobs</span>
          </span>
        </div>
        <div className="tm-intel-kpi">
          <span className="tm-intel-kpi-lab">Last commit</span>
          <span className="tm-intel-kpi-val">1h<span className="tm-intel-kpi-unit">· main</span></span>
        </div>
      </div>
    </aside>
  )
}
