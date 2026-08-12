"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import type { CompanyPulseItem } from "@/lib/api"
import { useSession } from "@/lib/hooks/use-auth"
import {
  useFollowCompany,
  type FollowCompanyAction,
} from "@/lib/hooks/use-follow-company"
import { MYRO_COINS_POLICY } from "@/lib/xp-policy"
import { formatCount } from "@/lib/format"
import {
  resolveCompaniesDirectoryState,
  type DirectoryAvailability,
  type DirectoryCompany,
} from "@/lib/companies/directory-state"
import {
  CompanySignalCard,
  CompanySignalRow,
  SignalLabel,
} from "@/components/companies/company-signal"
import "./companies-directory.css"

const SLOT_CAP = MYRO_COINS_POLICY.followedCompanyLimit
const EMPTY_DIRECTORY_COMPANIES: DirectoryCompany[] = []

interface Props {
  /** Every tracked company — the crawlable, searchable full list. */
  companies: DirectoryCompany[]
  /** The featured pool (top by open roles) that carries server-fetched pulse. */
  pool: DirectoryCompany[]
  /** Pulse for the pool, server-fetched (real numbers only). */
  pulses: CompanyPulseItem[]
  totalCount: number
  /** Distinct sectors for the filter pills (already trimmed to the top few). */
  sectors: string[]
  /** A failed public read is not a completed empty company directory. */
  availability: DirectoryAvailability
}

type SortMode = "pulse" | "open"

export function CompaniesDirectory({ companies, pool, pulses, totalCount, sectors, availability }: Props) {
  const { token } = useSession()
  const follow = useFollowCompany(token)
  const recovery = useQuery({
    queryKey: ["companies-directory-recovery"],
    queryFn: async () => (await import("@/lib/api")).jobs.indexableCompanies(),
    enabled: availability === "unavailable",
    retry: 2,
    retryDelay: (attempt) => 1_000 * (attempt + 1),
    staleTime: 60_000,
  })
  const [query, setQuery] = useState("")
  const [sector, setSector] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>("pulse")
  const directoryState = resolveCompaniesDirectoryState({
    initialStatus: availability,
    initialCompanies: companies,
    recovery: recovery.data,
    isRecovering: recovery.isLoading || recovery.isFetching,
    recoveryFailed: recovery.isError,
  })
  const directoryCompanies = directoryState.kind === "ready"
    ? directoryState.companies
    : EMPTY_DIRECTORY_COMPANIES
  const hasCompletedDirectory = directoryState.kind === "ready" || directoryState.kind === "empty"
  const visibleTotalCount = directoryState.kind === "ready" ? directoryCompanies.length : totalCount

  const pulseByName = useMemo(() => {
    const map = new Map<string, CompanyPulseItem>()
    for (const p of pulses) map.set(p.company_name, p)
    return map
  }, [pulses])

  // Featured cards: the pool, sector-filtered, sorted by pulse (nulls last) or
  // open roles. Ranking by pulse is the directory's promise (discovery surface).
  const featured = useMemo(() => {
    const rows = sector ? pool.filter((c) => c.industry === sector) : pool
    const withPulse = rows.map((c) => ({ c, p: pulseByName.get(c.name)?.pulse ?? null }))
    withPulse.sort((a, b) => {
      if (sort === "open") return b.c.count - a.c.count
      // pulse desc, null pulses sink below scored ones
      if (a.p === null && b.p === null) return b.c.count - a.c.count
      if (a.p === null) return 1
      if (b.p === null) return -1
      return b.p - a.p
    })
    return withPulse.map((r) => r.c)
  }, [pool, sector, sort, pulseByName])

  const topPulseName = useMemo(() => {
    let best: string | null = null
    let bestVal = -1
    for (const c of featured) {
      const p = pulseByName.get(c.name)?.pulse
      if (p != null && p > bestVal) { bestVal = p; best = c.name }
    }
    return best
  }, [featured, pulseByName])

  // Full list: search filters all companies (client-side over the initial HTML,
  // so the un-searched list is fully crawlable).
  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return directoryCompanies
    return directoryCompanies.filter((c) => c.name.toLowerCase().includes(q))
  }, [query, directoryCompanies])

  const followAction = (name: string): FollowCompanyAction => {
    if (token) return follow.action(name)
    return {
      following: false,
      pending: false,
      loading: false,
      disabled: false,
      toggle: () => {
        window.location.href = "/signup?ref=companies"
      },
    }
  }

  return (
    <div className="cd-root">
      <div className="cd-masthead">
        <div className="cd-masthead-copy">
          <SignalLabel>Companies</SignalLabel>
          <h1 className="cd-h1">
            {hasCompletedDirectory
              ? `${formatCount(visibleTotalCount)} MNCs, tracked live.`
              : "Companies, tracked live."}
          </h1>
          <p className="cd-sub">Every careers feed Myro watches, ranked by how hard it&rsquo;s hiring right now.</p>
        </div>
        <SlotsMeter used={follow.count} error={follow.error?.message ?? null} />
      </div>

      <div className="cd-toolbar">
        <label className="cd-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={hasCompletedDirectory ? `Search ${formatCount(visibleTotalCount)} companies…` : "Search companies…"}
            aria-label="Search companies"
            disabled={!hasCompletedDirectory}
          />
        </label>
        {sectors.length > 0 ? (
          <div className="cd-sectors" role="group" aria-label="Filter by sector">
            <button type="button" className={`cd-pill${sector === null ? " is-on" : ""}`} onClick={() => setSector(null)}>All</button>
            {sectors.map((s) => (
              <button key={s} type="button" className={`cd-pill${sector === s ? " is-on" : ""}`} onClick={() => setSector(s)}>{s}</button>
            ))}
          </div>
        ) : null}
        <div className="cd-sort" role="group" aria-label="Sort">
          <span className="cd-sort-label">Sort</span>
          <button type="button" className={sort === "pulse" ? "is-on" : ""} onClick={() => setSort("pulse")}>Demand pulse</button>
          <button type="button" className={sort === "open" ? "is-on" : ""} onClick={() => setSort("open")}>Open roles</button>
        </div>
      </div>

      {/* Featured pulse grid — the curated top, real pulse only. */}
      {hasCompletedDirectory && !query && featured.length > 0 ? (
        <div className="cd-grid">
          {featured.map((c) => (
            <CompanySignalCard
              key={c.name}
              name={c.name}
              pulse={pulseByName.get(c.name)}
              topSkill={null}
              followed={follow.followedNames.includes(c.name)}
              highlight={topPulseName === c.name}
              href={`/companies/${encodeURIComponent(c.name)}`}
              followAction={followAction(c.name)}
            />
          ))}
        </div>
      ) : null}

      {/* Full directory — every company, crawlable links, searchable. */}
      <div className="cd-all">
        <div className="cd-all-head">
          <SignalLabel live={false}>{query ? "Search results" : "All companies"}</SignalLabel>
          <span className="cd-all-count">{hasCompletedDirectory ? formatCount(filteredAll.length) : "—"}</span>
        </div>
        {directoryState.kind === "loading" ? (
          <CompaniesDirectoryRowsSkeleton />
        ) : directoryState.kind === "unavailable" ? (
          <div className="cd-empty" role="status">
            <p>Live company data is temporarily unavailable.</p>
            <button type="button" className="cd-retry" onClick={() => recovery.refetch()}>
              Try again
            </button>
          </div>
        ) : directoryState.kind === "empty" ? (
          <p className="cd-empty">
            No companies with live roles right now. <Link href="/intel">Browse live job data.</Link>
          </p>
        ) : filteredAll.length === 0 ? (
          <p className="cd-empty">No company matches &ldquo;{query}&rdquo;.</p>
        ) : (
          <div className="cd-all-list cs-row-list">
            {filteredAll.map((c) => (
              <CompanySignalRow
                key={c.name}
                name={c.name}
                meta={`${formatCount(c.count)} open`}
                followed={follow.followedNames.includes(c.name)}
                href={`/companies/${encodeURIComponent(c.name)}`}
                followAction={followAction(c.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function CompaniesDirectoryLoading() {
  return (
    <div className="cd-root" aria-busy="true" aria-label="Loading companies">
      <div className="cd-masthead">
        <div className="cd-masthead-copy">
          <SignalLabel>Companies</SignalLabel>
          <div className="cd-skeleton cd-skeleton-title" />
          <div className="cd-skeleton cd-skeleton-copy" />
        </div>
        <div className="cd-skeleton cd-skeleton-slots" />
      </div>
      <div className="cd-toolbar">
        <div className="cd-skeleton cd-skeleton-search" />
        <div className="cd-skeleton cd-skeleton-sort" />
      </div>
      <div className="cd-grid" aria-hidden>
        {Array.from({ length: 8 }, (_, index) => <div className="cd-skeleton cd-skeleton-card" key={index} />)}
      </div>
      <div className="cd-all">
        <div className="cd-all-head">
          <div className="cd-skeleton cd-skeleton-label" />
        </div>
        <CompaniesDirectoryRowsSkeleton />
      </div>
    </div>
  )
}

function CompaniesDirectoryRowsSkeleton() {
  return (
    <div className="cd-all-list cd-skeleton-rows" aria-hidden>
      {Array.from({ length: 16 }, (_, index) => <div className="cd-skeleton cd-skeleton-row" key={index} />)}
    </div>
  )
}

function SlotsMeter({ used, error }: { used: number; error: string | null }) {
  return (
    <div className="cd-slots" aria-label={`${used} of ${SLOT_CAP} compare slots used`}>
      <span className="cd-slots-label">Compare slots</span>
      <span className="cd-slots-dots" aria-hidden>
        {Array.from({ length: SLOT_CAP }, (_, i) => (
          <span key={i} className={`cd-slot-dot${i < used ? " is-on" : ""}`} />
        ))}
      </span>
      <span className="cd-slots-count">{used}/{SLOT_CAP}</span>
      <span className="cd-slots-cap">{error ?? "Following a company adds it to your heatmap & pulse."}</span>
    </div>
  )
}
