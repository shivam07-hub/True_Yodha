"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { home, jobs, type CompanyOpenRoleItem, type JobFitItem, type JobLocationFilters } from "@/lib/api"
import { getAccessToken } from "@/lib/session"
import { dataKeys } from "@/lib/domain-data"
import { cacheKey, withLocalCache } from "@/lib/local-cache"
import { useJobsRealtime } from "@/lib/hooks/use-jobs-realtime"
import { useGlobalJobSearch } from "@/lib/hooks/use-global-job-search"
import { useResultsSort, type ResultsSortKey } from "@/lib/hooks/use-results-sort"
import { IntelHero, IntelAuthedHeader } from "./intel/intel-hero"
import type { JobRowFit } from "./intel/intel-rows"
import { IntelCommandBar } from "./intel/intel-command-bar"
import { IntelResults, ResultsTab, ResultCompany, ResultGroup, ResultJob } from "./intel/intel-results"
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
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(0)
  const [uptime, setUptime] = useState("syncing now")
  const { sort, setSort } = useResultsSort("intel", "velocity")

  useJobsRealtime()

  // Optional session — read WITHOUT useAuth(), which redirects anon visitors to
  // /login (this is a public, SEO-indexed route). getAccessToken() just peeks.
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => { setToken(getAccessToken()) }, [])
  const authed = !!token

  // Personal header data (grill Q4=B/Q5=A). One cheap BFF call already used by
  // the dashboard; reused here for score + CV presence. Anon never fetches it.
  const { data: bootstrap } = useQuery({
    queryKey: ["intel_personal", token],
    queryFn: () => home.bootstrap(token as string),
    enabled: authed,
    staleTime: 5 * 60 * 1000,
  })
  const personalScore = bootstrap?.score?.total_score ?? null
  const hasCv = (bootstrap?.cv_versions?.versions?.length ?? 0) > 0

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
  // Real scraper start = earliest first_seen across the indexed corpus. Falls
  // back to the formatUptime default anchor until analytics loads.
  const scraperStartedMs = useMemo(() => {
    const iso = analytics?.scraper_started
    if (!iso) return undefined
    const t = Date.parse(iso)
    return Number.isFinite(t) ? t : undefined
  }, [analytics?.scraper_started])

  useEffect(() => {
    const tick = () => setUptime(formatUptime(Date.now(), scraperStartedMs))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [scraperStartedMs])

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
        kind: "city" as const,
      }))
  }, [analytics])

  // Industries/Cities drill-down → top companies hiring in the selected group.
  const groupKind: "industry" | "city" | null =
    tab === "industries" ? "industry" : tab === "cities" ? "city" : null

  // Default active group to the first row on a group tab; clear on leaving so the
  // right panel never shows a stale company list.
  useEffect(() => {
    if (!groupKind) { setActiveGroup(null); return }
    const list = groupKind === "industry" ? industriesView : citiesView
    if (!list.length) return
    if (!activeGroup || !list.find((g) => g.name === activeGroup)) {
      setActiveGroup(list[0].name)
    }
  }, [groupKind, industriesView, citiesView, activeGroup])

  const { data: groupCompaniesData, isLoading: groupCompaniesLoading } = useQuery({
    queryKey: dataKeys.topCompaniesAt(groupKind, activeGroup),
    queryFn: () => jobs.topCompaniesAt(
      { kind: groupKind as "industry" | "city", name: activeGroup as string }, 8,
    ),
    enabled: !!groupKind && !!activeGroup,
    staleTime: OPEN_ROLES_STALE_MS,
  })
  const groupCompanies = groupCompaniesData?.companies ?? []

  // Company row in the group panel → jump to its open-roles drill-down (Q2=A).
  function jumpToCompany(company: string) {
    setActiveCoId(company)
    setActiveGroup(null)
    setTab("companies")
  }

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

  // Lazy fit — only the visible company's open roles (grill Q3=A). Fires on
  // company-select; never eager across the company list. Skipped without a CV
  // (header carries the upload CTA instead).
  const visibleJobIds = useMemo(() => openRoleJobs.map((j) => j.id), [openRoleJobs])
  const { data: fitData } = useQuery({
    queryKey: ["intel_fit", token, visibleJobIds],
    queryFn: () => jobs.fitBatch(token as string, visibleJobIds),
    enabled: authed && hasCv && visibleJobIds.length > 0,
    staleTime: 30 * 60 * 1000,
  })
  const fits = useMemo(() => {
    const m = new Map<string, JobRowFit>()
    for (const f of (fitData?.fits ?? []) as JobFitItem[]) {
      m.set(f.job_id, {
        overlap_score: f.overlap_score,
        matched_count: f.matched_count,
        total_skills: f.total_skills,
      })
    }
    return m
  }, [fitData])

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
      {authed ? (
        <IntelAuthedHeader
          score={personalScore}
          hasCv={hasCv}
          parsedToday={analytics?.total_jobs_today ?? 0}
        />
      ) : (
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
      )}

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
        activeGroup={activeGroup}
        onActiveGroup={setActiveGroup}
        groupCompanies={groupCompanies}
        isGroupCompaniesLoading={groupCompaniesLoading}
        onCompanyJump={jumpToCompany}
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
        authed={authed}
        hasCv={hasCv}
        fits={fits}
      />

      {/* "Open by default" commons + canonical footer are folded into
          <PublicFooter commons />, mounted by app/intel/page.tsx. */}
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
