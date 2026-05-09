"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronUp, ExternalLink, Loader2, Search, Sparkles } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { jobs, scores, type JobComputeStatusResponse, type JobMatch } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import { clearLocalCache, userCacheKey, withLocalCache } from "@/lib/local-cache"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

function scoreColor(score: number): string {
  if (score >= 75) return "var(--tm-success)"
  if (score >= 50) return "var(--tm-warning)"
  return "var(--tm-text-faint)"
}

function JobCard({ job, onTrack }: { job: JobMatch; onTrack: (jobId: string) => void }) {
  const [showExplanation, setShowExplanation] = useState(false)
  const firstPlan = job.action_plan[0]
  const score = Math.min(100, Math.max(0, Math.round(job.overlap_score)))
  const color = scoreColor(score)
  const explanationId = `job-explanation-${job.id}`

  return (
    <article style={{
      borderRadius: "var(--tm-radius)",
      border: "1px solid var(--tm-border-soft)",
      background: "rgba(255,255,255,0.02)",
      padding: "var(--tm-card-pad)",
      transition: "border-color var(--tm-dur) var(--tm-ease)",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--tm-border)" }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {job.title}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--tm-text-faint)" }}>
            {[job.company, job.location, job.remote ? "Remote" : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        {job.llm_rank && (
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 600,
            padding: "3px 8px", borderRadius: "var(--tm-radius-pill)",
            background: "var(--tm-accent-wash)",
            color: "var(--tm-accent)",
            border: "1px solid var(--tm-border-soft)",
          }}>
            Rank {job.llm_rank}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
        <div style={{ flex: 1, height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, width: `${score}%`, background: color, transition: "width 700ms var(--tm-ease)" }} />
        </div>
        <span style={{ width: 40, textAlign: "right", fontSize: 13, fontWeight: 500, color }}>{score}%</span>
      </div>

      {job.llm_explanation && (
        <div style={{ marginTop: 12 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExplanation((value) => !value)}
            aria-expanded={showExplanation}
            aria-controls={explanationId}
          >
            {showExplanation ? <ChevronUp /> : <ChevronDown />}
            {showExplanation ? "Hide explanation" : "Show explanation"}
          </Button>
          {showExplanation && (
            <p id={explanationId} style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, color: "var(--tm-text-muted)" }}>
              {job.llm_explanation}
            </p>
          )}
        </div>
      )}

      {firstPlan && (
        <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-border-soft)", fontSize: 13, color: "var(--tm-text-muted)" }}>
          <span style={{ fontWeight: 600, color: "var(--tm-accent)" }}>Next: </span>
          {firstPlan.focus} · {firstPlan.tasks[0]}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Button variant="outline" size="sm" onClick={() => onTrack(job.job_id)}>
          + Track
        </Button>
        {job.source_url && (
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--tm-text-muted)", textDecoration: "none", transition: "color var(--tm-dur) var(--tm-ease)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-accent)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-muted)" }}
          >
            Open role <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        )}
      </div>
    </article>
  )
}

export default function JobsPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const computeStreamAbortRef = useRef<AbortController | null>(null)
  const [search, setSearch] = useState("")
  const [selectedCity, setSelectedCity] = useState("")
  const [selectedMode, setSelectedMode] = useState("")
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null)
  const [isRefreshingMatches, setIsRefreshingMatches] = useState(false)

  const matches = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => withLocalCache(
      userCacheKey(token!, ["matches"]),
      MATCHES_TTL,
      () => jobs.matches(token!),
    ),
    enabled: !!token,
    staleTime: MATCHES_TTL,
  })

  const scoresQuery = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  const hasCv = !scoresQuery.isLoading && !!scoresQuery.data

  const isFeedStale = (() => {
    const feedAt = matches.data?.feed_updated_at
    const computedAt = matches.data?.matches_computed_at
    if (!feedAt || !computedAt || !matches.data?.total) return false
    return new Date(feedAt) > new Date(computedAt)
  })()

  function stopComputeStream(): void {
    computeStreamAbortRef.current?.abort()
    computeStreamAbortRef.current = null
  }

  function applyComputeStatus(statusPayload: JobComputeStatusResponse): void {
    if (statusPayload.status === "queued") {
      setIsRefreshingMatches(true)
      setRefreshNotice(statusPayload.message || "Refresh queued. We’ll update this list shortly.")
      return
    }
    if (statusPayload.status === "running") {
      setIsRefreshingMatches(true)
      setRefreshNotice(statusPayload.message || "Refreshing matches in the background…")
      return
    }
    if (statusPayload.status === "failed") {
      setIsRefreshingMatches(false)
      setRefreshNotice(statusPayload.error || "Refresh failed. Please try again.")
      stopComputeStream()
      return
    }
    if (statusPayload.status === "succeeded") {
      setIsRefreshingMatches(false)
      if (statusPayload.from_cache) {
        setRefreshNotice("Using this week’s cached matches.")
      } else if ((statusPayload.matches_written ?? 0) > 0) {
        setRefreshNotice(`Updated ${statusPayload.matches_written ?? 0} matched roles.`)
      } else if (statusPayload.needs_onboarding) {
        setRefreshNotice("Upload your CV first to generate role matches.")
      } else {
        setRefreshNotice("No match set generated. Try updating target roles in Intel, then refresh.")
      }
      clearLocalCache(userCacheKey(token!, ["matches"]))
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      stopComputeStream()
      return
    }
    if (statusPayload.status === "idle") {
      setIsRefreshingMatches(false)
      stopComputeStream()
    }
  }

  async function startComputeStatusStream(): Promise<void> {
    if (!token) return
    stopComputeStream()
    const controller = new AbortController()
    computeStreamAbortRef.current = controller
    try {
      await jobs.computeStatusStream(token, (statusPayload) => {
        applyComputeStatus(statusPayload)
      }, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      setIsRefreshingMatches(false)
      setRefreshNotice((error as Error).message || "Could not receive refresh progress updates.")
      stopComputeStream()
    }
  }

  const compute = useMutation({
    mutationFn: () => jobs.compute(token!),
    onSuccess: (payload) => {
      if (payload.status === "queued" || payload.status === "running" || payload.already_running) {
        setIsRefreshingMatches(true)
        setRefreshNotice(payload.message || "Refreshing matches in the background…")
        void startComputeStatusStream()
        return
      }
      applyComputeStatus({
        user_id: "current",
        batch_week: payload.batch_week,
        status: "succeeded",
        job_id: payload.job_id ?? null,
        already_running: !!payload.already_running,
        matches_written: payload.matches_written,
        from_cache: payload.from_cache,
        needs_onboarding: payload.needs_onboarding ?? false,
        debug: payload.debug ?? null,
        message: payload.message ?? null,
        error: null,
        enqueued_at: null,
        started_at: null,
        finished_at: null,
      })
    },
    onError: () => {
      setIsRefreshingMatches(false)
      setRefreshNotice("Refresh failed. Please try again.")
    },
  })

  const track = useMutation({
    mutationFn: (jobId: string) => jobs.updateApplication(token!, jobId, { status: "pending" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.applications() }),
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = matches.data?.jobs ?? []
    const modeFilter = selectedMode.trim().toLowerCase()
    const cityFilter = selectedCity.trim().toLowerCase()
    const byLocation = list.filter((job) => {
      if (cityFilter && (job.location_city || "").toLowerCase() !== cityFilter) return false
      if (modeFilter && (job.location_mode || "").toLowerCase() !== modeFilter) return false
      return true
    })
    if (!term) return byLocation
    return byLocation.filter((job) =>
      [job.title, job.company, job.location, job.location_city].filter(Boolean).some((value) =>
        value!.toLowerCase().includes(term),
      ),
    )
  }, [matches.data?.jobs, search, selectedCity, selectedMode])

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (matches.data?.jobs ?? [])
            .map((job) => (job.location_city || "").trim())
            .filter((value) => value && value.toLowerCase() !== "unknown"),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [matches.data?.jobs],
  )

  const modeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (matches.data?.jobs ?? [])
            .map((job) => (job.location_mode || "").trim())
            .filter((value) => value && value.toLowerCase() !== "unknown"),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [matches.data?.jobs],
  )

  useEffect(() => {
    return () => {
      computeStreamAbortRef.current?.abort()
      computeStreamAbortRef.current = null
    }
  }, [])

  if (!ready) return null

  return (
    <AppShell>
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)", overflowY: "auto", height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <CVRequiredNudge hasCv={hasCv} feature="your job matches" />
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
                  Full Job List
                </div>
                <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 4 }}>
                  Matched Jobs
                </h1>
                <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                  {matches.data?.total ?? 0} recommendations from latest market batch
                </p>
              </div>
              <Button
                variant="outline"
                size="md"
                onClick={() => {
                  setRefreshNotice(null)
                  compute.mutate()
                }}
                disabled={!token}
                loading={compute.isPending || isRefreshingMatches}
              >
                <Sparkles />
                Refresh matches
              </Button>
            </div>
            {refreshNotice && (
              <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                {refreshNotice}
              </p>
            )}

            {isFeedStale && !isRefreshingMatches && !compute.isPending && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: "10px 14px", borderRadius: "var(--tm-radius-sm)",
                background: "var(--tm-warning-wash)", border: "1px solid var(--tm-warning)",
                marginBottom: 8,
              }}>
                <span style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text)" }}>
                  New jobs added to the feed since your last match — your results may be outdated.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setRefreshNotice(null); compute.mutate() }}
                  className="shrink-0 !text-[var(--tm-warning)] !border-[var(--tm-warning)] hover:!bg-[var(--tm-warning-wash)]"
                >
                  Refresh now
                </Button>
              </div>
            )}

            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "var(--tm-text-faint)", pointerEvents: "none" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roles or companies…"
                className="tm-input"
                style={{ paddingLeft: 36 }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                Location
              </div>
              <select className="tm-input" style={{ maxWidth: 220, height: 34, fontSize: 12 }} value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
                <option value="">All cities</option>
                {cityOptions.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
              <select className="tm-input" style={{ maxWidth: 180, height: 34, fontSize: 12 }} value={selectedMode} onChange={(e) => setSelectedMode(e.target.value)}>
                <option value="">All modes</option>
                {modeOptions.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
              {(selectedCity || selectedMode) && (
                <Button variant="outline" size="sm" onClick={() => { setSelectedCity(""); setSelectedMode("") }}>
                  Clear location
                </Button>
              )}
            </div>
          </div>

          {matches.isLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 160, borderRadius: "var(--tm-radius)", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)", animation: "pulse 2s infinite" }} />
              ))}
            </div>
          ) : filtered.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {filtered.map((job) => (
                <JobCard key={job.id} job={job} onTrack={(jobId) => track.mutate(jobId)} />
              ))}
            </div>
          ) : (
            <div style={{ padding: "48px 24px", textAlign: "center", borderRadius: "var(--tm-radius)", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 33, marginBottom: 12, opacity: 0.2, color: "var(--tm-accent)" }}>◆</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>No matches yet</p>
              <p style={{ fontSize: 14, color: "var(--tm-text-faint)" }}>
                Upload your CV, then refresh after market data import.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
