"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { JobsSkeleton } from "@/components/loading/page-skeletons"
import { JobCard } from "@/components/jobs/JobCard"
import { JobMatchDetail } from "@/components/jobs/match-brain"
import { RefreshMatchesButton } from "@/components/jobs/RefreshMatchesButton"
import { jobs, scores } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useJobRefresh } from "@/lib/hooks/use-job-refresh"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import { userCacheKey, withLocalCache } from "@/lib/local-cache"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

export default function JobsPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [selectedCity, setSelectedCity] = useState("")
  const [selectedMode, setSelectedMode] = useState("")
  const [saveToast, setSaveToast] = useState(false)
  const [detailJobId, setDetailJobId] = useState<string | null>(null)

  const refreshVm = useJobRefresh(token, queryClient)
  const isRefreshing = refreshVm.state === "charging" || refreshVm.state === "computing"

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

  const track = useMutation({
    mutationFn: (jobId: string) => jobs.updateApplication(token!, jobId, { status: "saved" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      queryClient.invalidateQueries({ queryKey: dataKeys.staleApplications() })
      setSaveToast(true)
      setTimeout(() => setSaveToast(false), 4000)
    },
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

  if (!ready || matches.isLoading) return <JobsSkeleton />

  return (
    <>
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)", overflowY: "auto", height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <CVRequiredNudge hasCv={hasCv} feature="your job matches" />
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--tm-interactive)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
                  Full Job List
                </div>
                <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 4 }}>
                  Matched Jobs
                </h1>
                <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                  {matches.data?.total ?? 0} recommendations from latest market batch
                </p>
              </div>
              <RefreshMatchesButton vm={refreshVm} disabled={!token} />
            </div>

            {isFeedStale && !isRefreshing && (
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
                  onClick={() => refreshVm.refresh()}
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
                <JobCard
                  key={job.id}
                  job={job}
                  onTrack={(jobId) => track.mutate(jobId)}
                  onSelect={(jobId) => setDetailJobId(jobId)}
                />
              ))}
            </div>
          ) : (
            <div style={{ padding: "48px 24px", textAlign: "center", borderRadius: "var(--tm-radius)", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 33, marginBottom: 12, opacity: 0.2, color: "var(--tm-interactive)" }}>◆</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>No matches yet</p>
              <p style={{ fontSize: 14, color: "var(--tm-text-faint)" }}>
                Upload your CV, then refresh after market data import.
              </p>
            </div>
          )}
        </div>
      </div>

      {detailJobId && (() => {
        const job = (matches.data?.jobs ?? []).find((j) => j.job_id === detailJobId)
        return job ? <JobMatchDetail job={job} onClose={() => setDetailJobId(null)} /> : null
      })()}

      {saveToast && (
        <div
          aria-live="polite"
          style={{
            position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
            background: "var(--tm-surface)", color: "var(--tm-text)",
            border: "1px solid var(--tm-int-border)",
            padding: "8px 18px", borderRadius: 99,
            fontSize: 13, fontFamily: "inherit",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            zIndex: 300, display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <span>Saved.</span>
          <Link
            href="/tracker?stage=saved"
            style={{
              color: "var(--tm-interactive)", textDecoration: "none", fontWeight: 600,
            }}
          >
            View in Tracker →
          </Link>
        </div>
      )}
    </>
  )
}
