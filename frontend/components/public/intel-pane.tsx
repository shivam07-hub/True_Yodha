"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { cacheKey, withLocalCache } from "@/lib/local-cache"
import { useJobsRealtime } from "@/lib/hooks/use-jobs-realtime"
import { IntelHero } from "./intel/intel-hero"
import { IntelCommandBar } from "./intel/intel-command-bar"
import { IntelResults, ResultsTab, ResultCompany, ResultGroup, ResultJob } from "./intel/intel-results"
import { IntelCommons } from "./intel/intel-commons"
import { sparkFor, synthJobsFor, velocityFor } from "./intel/intel-data"
import {
  countryForCompany, formatUptime, industryForCompany,
  matchesQuickFilter, seedAge, smartMatch,
} from "./intel/intel-filters"
import "./intel-pane.css"

const ANALYTICS_TTL = 7 * 24 * 60 * 60 * 1000

export function IntelPane() {
  const [query, setQuery] = useState("")
  const [activeChips, setActiveChips] = useState<string[]>([])
  const [tab, setTab] = useState<ResultsTab>("companies")
  const [activeCoId, setActiveCoId] = useState<string | null>(null)
  const [ages, setAges] = useState<Record<string, number>>({})
  const [tickFlash, setTickFlash] = useState(false)
  const [jobsTotalOffset, setJobsTotalOffset] = useState(0)
  const [uptime, setUptime] = useState(() => formatUptime(Date.now()))

  useJobsRealtime()

  const { data: analytics } = useQuery({
    queryKey: dataKeys.jobsAnalyticsPublic("", "", "", ""),
    queryFn: () => withLocalCache(
      cacheKey(["analytics_public", "", "", "", ""]),
      ANALYTICS_TTL,
      () => jobs.analytics(undefined, {}),
    ),
    staleTime: ANALYTICS_TTL,
  })

  // Build company/industry/city lists from real backend analytics
  const allCompanies: ResultCompany[] = useMemo(() => {
    if (!analytics) return []
    const industryNames = analytics.by_industry.map((i) => i.name)
    const countryCodes = analytics.by_location_country
      .filter((c) => c.name.toLowerCase() !== "unknown")
      .map((c) => c.name)
    return analytics.by_company.map((c) => ({
      id: c.name,
      name: c.name,
      industry: industryForCompany(c.name, industryNames),
      country: countryForCompany(c.name, countryCodes),
      open: c.count,
      velocity: velocityFor(c.name),
      sparks: sparkFor(c.name, c.count),
      ageSec: 0, // injected from `ages` below
    }))
  }, [analytics])

  // Seed ages once per analytics load
  useEffect(() => {
    if (!analytics) return
    const next: Record<string, number> = {}
    analytics.by_company.forEach((c) => { next[c.name] = seedAge(c.name) })
    setAges(next)
  }, [analytics])

  // Tick ages forward + tick global counter
  useEffect(() => {
    if (!analytics) return
    const id = setInterval(() => {
      setAges((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((k) => { next[k] = next[k] + 1 })
        if (Math.random() < 0.45 && analytics.by_company.length) {
          const co = analytics.by_company[Math.floor(Math.random() * analytics.by_company.length)]
          next[co.name] = Math.floor(Math.random() * 5)
          setJobsTotalOffset((j) => j + 1)
          setTickFlash(true)
          setTimeout(() => setTickFlash(false), 1600)
        }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [analytics])

  // Tick uptime
  useEffect(() => {
    const id = setInterval(() => setUptime(formatUptime(Date.now())), 1000)
    return () => clearInterval(id)
  }, [])

  const cityPool = useMemo(() => {
    if (!analytics) return [] as { name: string; country: string }[]
    const countryCodes = analytics.by_location_country
      .filter((c) => c.name.toLowerCase() !== "unknown")
      .map((c) => c.name)
    return analytics.by_location_city
      .filter((c) => c.name.toLowerCase() !== "unknown")
      .map((c, i) => ({ name: c.name, country: countryCodes[i % Math.max(countryCodes.length, 1)] || "US" }))
  }, [analytics])

  // Synth job pool — one company at a time, since user picks the row.
  const jobsForActiveAll: ResultJob[] = useMemo(() => {
    if (!activeCoId) return []
    const co = allCompanies.find((c) => c.id === activeCoId)
    if (!co) return []
    return synthJobsFor(co.name, co.open, cityPool)
  }, [activeCoId, allCompanies, cityPool])

  // Apply query + chips against the active company's job pool
  const filteredJobs: ResultJob[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const co = allCompanies.find((c) => c.id === activeCoId)
    return jobsForActiveAll.filter((j) => {
      if (q) {
        const hay = [j.title, j.city, j.country, j.mode, co?.name, co?.industry, ...(j.skills || [])]
          .join(" ").toLowerCase()
        if (!hay.includes(q) && !smartMatch(q, j)) return false
      }
      for (const id of activeChips) {
        if (!matchesQuickFilter(id, j, co)) return false
      }
      return true
    })
  }, [jobsForActiveAll, query, activeChips, allCompanies, activeCoId])

  // Companies whose synthesized pool yields ANY match for current filters.
  // Cheap heuristic: a company passes if (no filter) OR (matches via company.industry/country shorthand).
  const filteredCompanies: ResultCompany[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const chips = activeChips
    const list = allCompanies.map((co) => ({
      ...co,
      ageSec: ages[co.name] ?? co.ageSec,
    }))
    if (!q && !chips.length) {
      return list.sort((a, b) => b.velocity - a.velocity)
    }
    return list
      .filter((co) => {
        if (q) {
          const hay = [co.name, co.industry, co.country].join(" ").toLowerCase()
          if (!hay.includes(q)) {
            // Allow companies whose synth job pool matches
            const pool = synthJobsFor(co.name, co.open, cityPool)
            if (!pool.some((j) => smartMatch(q, j) || [j.title, j.city, j.mode].join(" ").toLowerCase().includes(q))) {
              return false
            }
          }
        }
        if (chips.length) {
          const pool = synthJobsFor(co.name, co.open, cityPool)
          const okAll = chips.every((id) => pool.some((j) => matchesQuickFilter(id, j, co)))
          if (!okAll) return false
        }
        return true
      })
      .sort((a, b) => b.velocity - a.velocity)
  }, [allCompanies, ages, query, activeChips, cityPool])

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

  const jobsTotal = (analytics?.total_jobs ?? 0) + jobsTotalOffset
  const activeCompanyName = useMemo(() => {
    const co = filteredCompanies.find((c) => c.id === activeCoId) ?? allCompanies.find((c) => c.id === activeCoId)
    return co?.name ?? null
  }, [filteredCompanies, allCompanies, activeCoId])

  const jobsShown = (query || activeChips.length) ? filteredJobs.length : jobsTotal

  function toggleChip(id: string) {
    setActiveChips((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id])
  }

  // Reasonable defaults if analytics hasn't loaded yet (avoids flash of 0s)
  const safeJobsTotal = jobsTotal || 28047
  const safeCompanies = analytics?.total_companies || 148
  const safeIndustries = analytics?.total_industries || 10

  return (
    <div className="tm-intel-page tm-page-enter">
      <IntelHero
        jobsCount={safeJobsTotal}
        jobsTick={tickFlash}
        companiesCount={safeCompanies}
        industriesCount={safeIndustries}
        industriesMapped={safeIndustries}
        parsedToday={Math.max(7418, Math.floor(safeJobsTotal * 0.26))}
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
        jobsForActive={filteredJobs.slice(0, 6)}
        jobsForActiveTotal={filteredJobs.length}
        activeCompanyName={activeCompanyName}
      />

      <IntelCommons />

      <footer className="tm-intel-footer">
        <span>© 2026 Myro</span>
        <span>·</span>
        <span className="tm-intel-footer-tag">aligning careers with the stars</span>
        <span className="tm-intel-spacer" />
        <a href="#">Status</a>
        <span>·</span>
        <a href="#">Docs</a>
        <span>·</span>
        <a href="#">RSS</a>
        <span>·</span>
        <a href="#">@myroHQ</a>
      </footer>
    </div>
  )
}
