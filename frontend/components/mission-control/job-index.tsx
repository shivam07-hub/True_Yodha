"use client"

import * as React from "react"
import "./job-index.css"
import { Icon } from "./icons"
import { FocusedJob } from "./focused-job"
import { RefreshMatchesButton } from "@/components/jobs/RefreshMatchesButton"
import { openRefreshGate } from "@/store/refreshGateStore"
import { Button } from "@/components/ui/button"
import type {
  ApplicationResponse,
  ApplicationStatus,
  JobMatch,
  SkillGapItem,
} from "@/lib/api"
import type { UseJobRefreshResult } from "@/lib/hooks/use-job-refresh"

type Segment = "myro" | "liked" | "all"

interface IndexRow {
  jobId: string
  company: string | null
  role: string
  fit: number | null
  isMatch: boolean
  isLiked: boolean
  job: JobMatch
}

interface JobIndexProps {
  jobs: JobMatch[]
  apps: ApplicationResponse[]
  appsByJobId: Record<string, ApplicationStatus>
  token: string
  cartSkillNames: Set<string>
  refresh: UseJobRefreshResult
  total: number
  feedUpdatedAt: string | null
  matchesComputedAt: string | null
  initialJobId?: string | null
  onStatus: (jobId: string, status: ApplicationStatus) => void
  onSkillToggle: (skill: SkillGapItem) => void
}

/** A self-discovery / saved job has no JobMatch — synthesise a minimal one so it
 *  can still expand into the FocusedJob card. */
function synthMatch(app: ApplicationResponse): JobMatch {
  return {
    id: app.id,
    job_id: app.job_id,
    title: app.title,
    company: app.company,
    location: null,
    remote: false,
    overlap_score: 0,
    llm_rank: null,
    llm_explanation: null,
    batch_week: "",
    source_url: null,
    matched_skills: [],
    job_description: app.job_description ?? null,
  }
}

export function JobIndex({
  jobs,
  apps,
  appsByJobId,
  token,
  cartSkillNames,
  refresh,
  total,
  feedUpdatedAt,
  matchesComputedAt,
  initialJobId,
  onStatus,
  onSkillToggle,
}: JobIndexProps) {
  const [segment, setSegment] = React.useState<Segment>("myro")
  const [sections, setSections] = React.useState<string[]>(() =>
    initialJobId ? [initialJobId] : [],
  )
  const cardRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
  const isRefreshing = refresh.state === "charging" || refresh.state === "computing"

  // Jobs the user has acted on — saved OR self-discovered.
  const likedIds = React.useMemo(() => {
    const s = new Set<string>()
    for (const a of apps) {
      if (a.status === "saved" || a.source === "user_discovery") s.add(a.job_id)
    }
    return s
  }, [apps])

  // Unified row list: every Myro match + any liked job not already a match.
  const rows: IndexRow[] = React.useMemo(() => {
    const out: IndexRow[] = []
    const seen = new Set<string>()
    for (const j of jobs) {
      seen.add(j.job_id)
      out.push({
        jobId: j.job_id,
        company: j.company,
        role: j.title,
        fit: Math.round(j.overlap_score),
        isMatch: true,
        isLiked: likedIds.has(j.job_id),
        job: j,
      })
    }
    for (const a of apps) {
      if (seen.has(a.job_id)) continue
      if (!(a.status === "saved" || a.source === "user_discovery")) continue
      seen.add(a.job_id)
      out.push({
        jobId: a.job_id,
        company: a.company,
        role: a.title,
        fit: null,
        isMatch: false,
        isLiked: true,
        job: synthMatch(a),
      })
    }
    return out
  }, [jobs, apps, likedIds])

  const counts = React.useMemo(
    () => ({
      myro: rows.filter((r) => r.isMatch).length,
      liked: rows.filter((r) => r.isLiked).length,
      all: rows.length,
    }),
    [rows],
  )

  const visibleRows = React.useMemo(() => {
    if (segment === "myro") return rows.filter((r) => r.isMatch)
    if (segment === "liked") return rows.filter((r) => r.isLiked)
    return rows
  }, [rows, segment])

  const rowById = React.useMemo(() => {
    const m: Record<string, IndexRow> = {}
    for (const r of rows) m[r.jobId] = r
    return m
  }, [rows])

  const scrollToCard = React.useCallback((jobId: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cardRefs.current[jobId]?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    })
  }, [])

  // Click an index row → accordion reset to a single open card.
  const openRow = React.useCallback(
    (jobId: string) => {
      setSections([jobId])
      scrollToCard(jobId)
    },
    [scrollToCard],
  )

  // keep going ↓ → append the next-best unopened match.
  const keepGoing = React.useCallback(() => {
    const open = new Set(sections)
    const next = rows.find((r) => r.isMatch && !open.has(r.jobId))
    if (!next) return
    setSections((prev) => [...prev, next.jobId])
    scrollToCard(next.jobId)
  }, [rows, sections, scrollToCard])

  const collapseAll = React.useCallback(() => setSections([]), [])

  const hasMoreMatches = rows.some((r) => r.isMatch && !sections.includes(r.jobId))

  const isFeedStale = (() => {
    if (!feedUpdatedAt || !matchesComputedAt || !total) return false
    return new Date(feedUpdatedAt) > new Date(matchesComputedAt)
  })()

  const SEGMENTS: Array<{ key: Segment; label: string; count: number }> = [
    { key: "myro", label: "Myro found", count: counts.myro },
    { key: "liked", label: "Liked", count: counts.liked },
    { key: "all", label: "All", count: counts.all },
  ]

  return (
    <div className="ji" id="browse">
      <div className="ji-head">
        <div className="ji-segments" role="tablist" aria-label="Filter matches">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={segment === s.key}
              disabled={s.count === 0 && s.key !== "myro"}
              className={`ji-seg tm-control-focus${segment === s.key ? " active" : ""}`}
              onClick={() => setSegment(s.key)}
            >
              {s.label}
              <span className="ji-seg-count">{s.count}</span>
            </button>
          ))}
        </div>
        <div className="ji-head-right">
          <span className="ji-count">{total} from latest market batch</span>
          <RefreshMatchesButton vm={refresh} disabled={!token} />
        </div>
      </div>

      {isFeedStale && !isRefreshing ? (
        <div className="ji-stale">
          <span>New jobs added since your last match — results may be outdated.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={openRefreshGate}
            className="shrink-0 !text-[var(--tm-warning)] !border-[var(--tm-warning)] hover:!bg-[var(--tm-warning-wash)]"
          >
            Refresh now
          </Button>
        </div>
      ) : null}

      {visibleRows.length === 0 ? (
        <div className="ji-empty">
          <div className="ji-empty-msg">No matches yet — refresh after the next market batch.</div>
        </div>
      ) : (
        <div className="ji-rows">
          {visibleRows.map((r) => (
            <button
              key={r.jobId}
              type="button"
              className={`ji-row tm-control-focus${sections.includes(r.jobId) ? " active" : ""}`}
              onClick={() => openRow(r.jobId)}
            >
              <span className="ji-row-main">
                <span className="ji-row-co">{r.company ?? "—"}</span>
                <span className="ji-row-role">{r.role}</span>
              </span>
              {r.fit != null ? (
                <span className="ji-row-fit">{r.fit}%</span>
              ) : (
                <span className="ji-row-fit ji-row-fit--liked">★</span>
              )}
            </button>
          ))}
        </div>
      )}

      {sections.length > 0 ? (
        <button type="button" className="mc-all-matches tm-control-focus" onClick={collapseAll}>
          <Icon name="arrowLeft" size={12} /> All matches
        </button>
      ) : null}

      {sections.map((jobId, i) => {
        const row = rowById[jobId]
        if (!row || !token) return null
        const status = appsByJobId[jobId] ?? "saved"
        const isLast = i === sections.length - 1
        return (
          <div key={jobId}>
            {i > 0 ? (
              <div className="mc-loop-divider">
                <div className="line" />
                <div className="lbl">{row.company ?? row.role}</div>
                <div className="line" />
              </div>
            ) : null}
            <FocusedJob
              ref={(el) => {
                cardRefs.current[jobId] = el
              }}
              job={row.job}
              status={status}
              token={token}
              isNew={i > 0}
              cycleIndex={i + 1}
              cartSkillNames={cartSkillNames}
              onStatus={(st) => onStatus(jobId, st)}
              onSkillToggle={onSkillToggle}
            />
            {isLast && hasMoreMatches ? (
              <button type="button" className="ji-keep-going tm-control-focus" onClick={keepGoing}>
                Keep going <Icon name="chevDown" size={14} />
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
