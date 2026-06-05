"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs, type CompanyOpenRoleItem, type JobLocationFilters } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { cacheKey, withLocalCache } from "@/lib/local-cache"
import { useJobsRealtime } from "@/lib/hooks/use-jobs-realtime"
import { useGlobalJobSearch } from "@/lib/hooks/use-global-job-search"
import { useResultsSort, type ResultsSortKey } from "@/lib/hooks/use-results-sort"
import { IntelHero } from "./intel/intel-hero"
import { IntelCommandBar } from "./intel/intel-command-bar"
import { IntelResults, ResultsTab, ResultCompany, ResultGroup, ResultJob } from "./intel/intel-results"
import { IntelCommons } from "./intel/intel-commons"
import { CHIP_FILTER, COUNTRY_CHIP_IDS, sparkFor, velocityFor } from "./intel/intel-data"
import { formatUptime, weekDeltaFromBins } from "./intel/intel-filters"
import "./intel-pane.css"

const ANALYTICS_TTL = 7 * 24 * 60 * 60 * 1000
const OPEN_ROLES_STALE_MS = 24 * 60 * 60 * 1000  // 24h — matches backend cache

function compareCompanies(a: ResultCompany, b: ResultCompany, sort: ResultsSortKey): number {
  switch (sort) {
    case "open":    return b.open - a.open
    case "recency": return a.ageSec - b.ageSec   // smaller ageSec = more recent
    case "alpha":   return a.name.localeCompare(b.name)
    case "velocity":
    default:        return b.velocity - a.velocity
  }
}

export function IntelPane() {
  const [query, setQuery] = useState("")
  const [activeChips, setActiveChips] = useState<string[]>([])
  const [tab, setTab] = useState<ResultsTab>("companies")
  const [activeCoId, setActiveCoId] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(0)
  const [uptime, setUptime] = useState("syncing now")
  const { sort, setSort } = useResultsSort("intel", "velocity")

  useJobsRealtime()

  // Active chips → backend analytics filter. Country chips are mutually exclusive
  // (backend takes one location_country); "remote" is an independent mode toggle.
  const locationFilters: JobLocationFilters = useMemo(() => {
    const f: JobLocationFilters = {}
    for (const id of activeChips) {
      const c = CHIP_FILTER[id]
      if (!c) continue
      if (c.mode) f.locationMode = c.mode
      if (c.country) f.locationCountry = c.country
    }
    return f
  }, [activeChips])

  const filterCountry = locationFilters.locationCountry ?? ""
  const filterMode = locationFilters.locationMode ?? ""

  const { data: analytics, isLoading: analyticsLoading, isFetching: analyticsFetching } = useQuery({
    queryKey: dataKeys.jobsAnalyticsPublic("", "", filterCountry, filterMode),
    queryFn: () => withLocalCache(
      cacheKey(["analytics_public", "", "", filterCountry, filterMode]),
      ANALYTICS_TTL,
      () => jobs.analytics(undefined, locationFilters),
    ),
    staleTime: ANALYTICS_TTL,
  })

  // Global ⌘K search (real, debounced, trigram-backed).
  const globalSearch = useGlobalJobSearch(query, { limit: 12 })

  // Real open-roles for the active company. DB-bounded LIMIT 6.
  const { data: openRolesData, isLoading: openRolesLoading } = useQuery({
    queryKey: [...dataKeys.jobsAtCompany(activeCoId, 6), filterCountry],
    queryFn: () => jobs.listAtCompany(activeCoId as string, 6, filterCountry || null),
    enabled: !!activeCoId,
    staleTime: OPEN_ROLES_STALE_MS,
  })

  // Build company list from real backend analytics + real velocity bins + real last_seen.
  const allCompanies: ResultCompany[] = useMemo(() => {
    if (!analytics) return []
    return analytics.by_company.map((c) => {
      const realBins = c.velocity_bins && c.velocity_bins.length === 14 ? c.velocity_bins : null
      const lastSeenMs = c.last_seen_at ? new Date(c.last_seen_at).getTime() : null
      return {
        id: c.name,
        name: c.name,
        industry: c.industry ?? "",
        country: c.country ?? "",
        open: c.count,
        velocity: realBins ? weekDeltaFromBins(realBins) : velocityFor(c.name),
        sparks: realBins ?? sparkFor(c.name, c.count),
        ageSec: lastSeenMs != null && Number.isFinite(lastSeenMs)
          ? Math.max(0, Math.floor((nowMs - lastSeenMs) / 1000))
          : 0,
        lastSeenIso: c.last_seen_at ?? null,
      }
    })
  }, [analytics, nowMs])

  // Tick "now" after mount so the server/client first paint stays deterministic.
  useEffect(() => {
    const tick = () => setNowMs(Date.now())
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const tick = () => setUptime(formatUptime(Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const filteredCompanies: ResultCompany[] = useMemo(() => {
    // Global ⌘K search active: surface every company that has at least one hit.
    if (globalSearch.isActive) {
      const hitCompanies = new Set(
        globalSearch.hits
          .map((h) => (h.company_name || "").trim())
          .filter(Boolean),
      )
      const filtered = allCompanies.filter((co) => hitCompanies.has(co.name))
      return filtered.slice().sort((a, b) => compareCompanies(a, b, sort))
    }
    // Quick-filter chips scope analytics server-side (locationFilters → queryKey),
    // so allCompanies is already filtered. Here we only sort.
    return allCompanies.slice().sort((a, b) => compareCompanies(a, b, sort))
  }, [allCompanies, globalSearch.isActive, globalSearch.hits, sort])

  // Set default active company once analytics loads
  useEffect(() => {
    if (!filteredCompanies.length) return
    if (!activeCoId || !filteredCompanies.find((c) => c.id === activeCoId)) {
      setActiveCoId(filteredCompanies[0].id)
    }
  }, [filteredCompanies, activeCoId])

  const industriesView: ResultGroup[] = useMemo(() => {
    if (!analytics) return []
    return analytics.by_industry.map((it) => ({
      name: it.name,
      count: it.count,
      sparks: sparkFor(it.name, it.count),
      kind: "industry" as const,
    }))
  }, [analytics])

  const citiesView: ResultGroup[] = useMemo(() => {
    if (!analytics) return []
    return analytics.by_location_city
      .filter((c) => c.name.toLowerCase() !== "unknown")
      .map((it) => ({
        name: it.name,
        count: it.count,
        sparks: sparkFor(it.name, it.count),
        kind: "city" as const,
      }))
  }, [analytics])

  const counts = {
    companies: filteredCompanies.length,
    industries: industriesView.length,
    cities: citiesView.length,
  }

  const jobsTotal = analytics?.total_jobs ?? 0
  const activeCompanyName = useMemo(() => {
    const co = filteredCompanies.find((c) => c.id === activeCoId) ?? allCompanies.find((c) => c.id === activeCoId)
    return co?.name ?? null
  }, [filteredCompanies, allCompanies, activeCoId])

  const openRoleJobs: ResultJob[] = useMemo(() => {
    const items: CompanyOpenRoleItem[] = openRolesData?.jobs ?? []
    return items.map((j) => ({
      id: j.job_id,
      title: j.job_title,
      skills: [],
      city: j.location_city || "—",
      country: j.location_country || "",
      mode: humanMode(j.location_mode),
      comp: null,
      ageMin: j.created_at ? minutesSince(j.created_at, nowMs) : 0,
    }))
  }, [openRolesData, nowMs])

  const jobsShown = globalSearch.isActive ? globalSearch.hits.length : jobsTotal

  function toggleChip(id: string) {
    setActiveChips((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id)
      // Country chips are mutually exclusive — backend takes one location_country.
      const next = COUNTRY_CHIP_IDS.includes(id)
        ? c.filter((x) => !COUNTRY_CHIP_IDS.includes(x))
        : c
      return [...next, id]
    })
  }

  // Safe defaults during cold-start hydration (avoids flash of 0s). Replaced
  // inline when analytics arrives — tabular-nums in CSS prevents layout shift.
  const safeJobsTotal = jobsTotal || 28047
  const safeCompanies = analytics?.total_companies || 148
  const safeIndustries = analytics?.total_industries || 10

  return (
    <div className="tm-intel-page tm-page-enter">
      <IntelHero
        jobsCount={safeJobsTotal}
        jobsTick={false}
        companiesCount={safeCompanies}
        industriesCount={safeIndustries}
        industriesMapped={safeIndustries}
        parsedToday={analytics?.total_jobs_today ?? 0}
        jobsAdded1h={analytics?.jobs_added_1h ?? 0}
        companiesAdded7d={analytics?.companies_added_7d ?? 0}
        latestBatchIso={analytics?.latest_batch ?? null}
        uptime={uptime}
      />

      <IntelCommandBar
        value={query}
        onChange={setQuery}
        jobsTotal={safeJobsTotal}
        jobsShown={jobsShown}
        activeChips={activeChips}
        onToggleChip={toggleChip}
      />

      <IntelResults
        tab={tab}
        onTab={setTab}
        counts={counts}
        companies={filteredCompanies}
        industries={industriesView}
        cities={citiesView}
        activeCo={activeCoId}
        onActiveCo={setActiveCoId}
        jobsForActive={openRoleJobs}
        jobsForActiveTotal={openRoleJobs.length}
        activeCompanyName={activeCompanyName}
        isAnalyticsLoading={analyticsLoading}
        isFiltering={analyticsFetching && activeChips.length > 0}
        isOpenRolesLoading={openRolesLoading}
        globalSearch={{
          isActive: globalSearch.isActive,
          isLoading: globalSearch.isLoading,
          hits: globalSearch.hits.map((h) => ({
            job_id: h.job_id,
            job_title: h.job_title,
            company_name: h.company_name ?? null,
            city: h.location_city ?? null,
            mode: humanMode(h.location_mode),
          })),
        }}
        sort={sort}
        onSortChange={setSort}
        latestBatchIso={analytics?.latest_batch ?? null}
      />

      <IntelCommons />

      <footer className="tm-intel-footer">
        <span>© 2026 Myro</span>
        <span>·</span>
        <span className="tm-intel-footer-tag">aligning careers with the stars</span>
        <span className="tm-intel-spacer" />
        <a href="https://github.com/shivam07-hub/True_Yodha" target="_blank" rel="noreferrer">GitHub</a>
        <span>·</span>
        <a href="/about">About</a>
        <span>·</span>
        <a href="https://x.com/himyro" target="_blank" rel="noreferrer">@himyro</a>
      </footer>
    </div>
  )
}

function humanMode(raw?: string | null): string {
  const v = (raw || "").toLowerCase().trim()
  if (v === "remote") return "Remote"
  if (v === "hybrid") return "Hybrid"
  if (v === "onsite" || v === "on-site") return "On-site"
  return "—"
}

function minutesSince(iso: string, nowMs: number): number {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  if (nowMs <= 0) return 0
  return Math.max(0, Math.floor((nowMs - t) / 60_000))
}
