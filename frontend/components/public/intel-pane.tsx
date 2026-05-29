"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs, type CompanyOpenRoleItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { cacheKey, withLocalCache } from "@/lib/local-cache"
import { useJobsRealtime } from "@/lib/hooks/use-jobs-realtime"
import { useGlobalJobSearch } from "@/lib/hooks/use-global-job-search"
import { useResultsSort, type ResultsSortKey } from "@/lib/hooks/use-results-sort"
import { IntelHero } from "./intel/intel-hero"
import { IntelCommandBar } from "./intel/intel-command-bar"
import { IntelResults, ResultsTab, ResultCompany, ResultGroup, ResultJob } from "./intel/intel-results"
import { IntelCommons } from "./intel/intel-commons"
import { sparkFor, velocityFor } from "./intel/intel-data"
import {
  countryForCompany, formatUptime, industryForCompany, weekDeltaFromBins,
} from "./intel/intel-filters"
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
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [uptime, setUptime] = useState(() => formatUptime(Date.now()))
  const { sort, setSort } = useResultsSort("intel", "velocity")

  useJobsRealtime()

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: dataKeys.jobsAnalyticsPublic("", "", "", ""),
    queryFn: () => withLocalCache(
      cacheKey(["analytics_public", "", "", "", ""]),
      ANALYTICS_TTL,
      () => jobs.analytics(undefined, {}),
    ),
    staleTime: ANALYTICS_TTL,
  })

  // Global ⌘K search (real, debounced, trigram-backed).
  const globalSearch = useGlobalJobSearch(query, { limit: 12 })

  // Real open-roles for the active company. DB-bounded LIMIT 6.
  const { data: openRolesData, isLoading: openRolesLoading } = useQuery({
    queryKey: dataKeys.jobsAtCompany(activeCoId, 6),
    queryFn: () => jobs.listAtCompany(activeCoId as string, 6),
    enabled: !!activeCoId,
    staleTime: OPEN_ROLES_STALE_MS,
  })

  // Build company list from real backend analytics + real velocity bins + real last_seen.
  const allCompanies: ResultCompany[] = useMemo(() => {
    if (!analytics) return []
    const industryNames = analytics.by_industry.map((i) => i.name)
    const countryCodes = analytics.by_location_country
      .filter((c) => c.name.toLowerCase() !== "unknown")
      .map((c) => c.name)
    return analytics.by_company.map((c) => {
      const realBins = c.velocity_bins && c.velocity_bins.length === 14 ? c.velocity_bins : null
      const lastSeenMs = c.last_seen_at ? new Date(c.last_seen_at).getTime() : null
      return {
        id: c.name,
        name: c.name,
        industry: industryForCompany(c.name, industryNames),
        country: countryForCompany(c.name, countryCodes),
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

  // Tick "now" every 30s for live "updated Xs ago" display + uptime every second.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const id = setInterval(() => setUptime(formatUptime(Date.now())), 1000)
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
    // Quick-filter chips operate server-side ideally; today they narrow the
    // companies list by industry/country shorthand only (jobs are scoped by
    // analytics filter params, follow-up). Empty chips = unfiltered list.
    return allCompanies.slice().sort((a, b) => compareCompanies(a, b, sort))
  }, [allCompanies, globalSearch.isActive, globalSearch.hits, sort])

  // Quick-filter chips don't have a backend application path on the public mirror
  // yet — keep the toggle for affordance, but they don't filter results today.
  // Wiring chips to /jobs/analytics location_mode/location_country is a follow-up.
  void activeChips

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
      ageMin: j.created_at ? minutesSince(j.created_at) : 0,
    }))
  }, [openRolesData])

  const jobsShown = globalSearch.isActive ? globalSearch.hits.length : jobsTotal

  function toggleChip(id: string) {
    setActiveChips((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id])
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

function minutesSince(iso: string): number {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 60_000))
}
