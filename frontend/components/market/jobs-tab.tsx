"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useMutation } from "@tanstack/react-query"
import { jobs, type JobFeedItem, type JobFeedSort, type NameCountItem, type MarketAnalytics } from "@/lib/api"

// ── helpers ──────────────────────────────────────────────────────────────────

function jdSnippet(text: string | null | undefined, max = 180): string {
  if (!text) return ""
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

/** first_seen is an ISO date (day-granular). Render a compact age badge. */
function ageLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "1d ago"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

const MODE_LABEL: Record<string, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" }

// ── stat cards (display + clickable) ─────────────────────────────────────────

function StatCard({
  label, value, sub, onClick, active,
}: { label: string; value: string; sub?: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? `Filter: ${label}` : undefined}
      style={{
        textAlign: "left", cursor: onClick ? "pointer" : "default",
        background: active ? "var(--tm-int-bg-wash)" : "var(--tm-surface)",
        border: `1px solid ${active ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`,
        borderRadius: "var(--tm-radius-lg)", padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 6, minWidth: 0,
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
      {sub ? <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>{sub}</span> : null}
    </button>
  )
}

function StatCards({
  analytics, onClear, onCompany, onRole, onCountry, activeKind,
}: {
  analytics: MarketAnalytics
  onClear: () => void
  onCompany: (name: string) => void
  onRole: (role: string) => void
  onCountry: (country: string) => void
  activeKind: "all" | "company" | "role" | "country" | null
}) {
  const topCompany: NameCountItem | undefined = analytics.by_company?.[0]
  const topRole: NameCountItem | undefined = analytics.by_role?.[0]
  const topCountry: NameCountItem | undefined = analytics.by_location_country?.[0]
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginTop: 18 }} className="tm-feed-statcards">
      <StatCard label="Live jobs" value={analytics.total_jobs.toLocaleString()} sub="in your market" onClick={onClear} active={activeKind === "all"} />
      <StatCard label="Top hiring" value={topCompany?.name ?? "—"} sub={topCompany ? `${topCompany.count} open` : undefined} onClick={topCompany ? () => onCompany(topCompany.name) : undefined} active={activeKind === "company"} />
      <StatCard label="Hot role" value={topRole?.name ?? "—"} sub={topRole ? `${topRole.count} open` : undefined} onClick={topRole ? () => onRole(topRole.name) : undefined} active={activeKind === "role"} />
      <StatCard label="Near you" value={topCountry?.name ?? "—"} sub={topCountry ? `${topCountry.count} open` : undefined} onClick={topCountry ? () => onCountry(topCountry.name) : undefined} active={activeKind === "country"} />
    </div>
  )
}

// ── sort bar ─────────────────────────────────────────────────────────────────

const SORTS: { key: JobFeedSort; label: string }[] = [
  { key: "fresh", label: "Freshest first" },
  { key: "personal", label: "Personalised for me" },
  { key: "company", label: "Company wise" },
]

function SortBar({ sort, onSort }: { sort: JobFeedSort; onSort: (s: JobFeedSort) => void }) {
  return (
    <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 999 }}>
      {SORTS.map(s => {
        const on = sort === s.key
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSort(s.key)}
            style={{
              padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer",
              fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.03em", fontWeight: 600,
              background: on ? "var(--tm-interactive)" : "transparent",
              color: on ? "var(--tm-on-interactive, #fff)" : "var(--tm-text-muted)",
              transition: "all 120ms ease", whiteSpace: "nowrap",
            }}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

// ── job card ─────────────────────────────────────────────────────────────────

function SkillChip({ label }: { label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999, fontSize: 11, background: "var(--tm-surface-2, var(--tm-surface))", border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", whiteSpace: "nowrap" }}>
      {label}
    </span>
  )
}

function LocationLine({ job }: { job: JobFeedItem }) {
  const loc = job.location?.trim() || null
  const mode = job.location_mode && job.location_mode !== "unknown" ? job.location_mode : null
  const showMode = mode && (!loc || !loc.toLowerCase().includes(mode))
  if (!loc && !showMode) return null
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--tm-text-muted)" }}>
      {loc ? <span>{loc}</span> : null}
      {showMode ? (
        <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-faint)" }}>
          {MODE_LABEL[mode!] ?? mode}
        </span>
      ) : null}
    </div>
  )
}

function JobCard({
  job, followed, onOpen, onToggleFollow, followDisabled, followDisabledReason,
}: {
  job: JobFeedItem
  followed: boolean
  onOpen: () => void
  onToggleFollow: () => void
  followDisabled?: boolean
  followDisabledReason?: string
}) {
  const age = ageLabel(job.first_seen)
  const snippet = jdSnippet(job.job_description)
  return (
    <article
      onClick={onOpen}
      style={{
        cursor: "pointer", background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-radius-lg)", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12,
        transition: "border-color 120ms ease",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--tm-border)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--tm-border-soft)")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.25 }}>{job.job_title}</h3>
          {job.company_name ? <div style={{ fontSize: 14, color: "var(--tm-interactive)", marginTop: 3 }}>{job.company_name}</div> : null}
        </div>
        {age ? <span style={{ flexShrink: 0, fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.04em", color: "var(--tm-text-faint)" }}>{age}</span> : null}
      </div>

      <LocationLine job={job} />

      {snippet ? <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--tm-text-muted)" }}>{snippet}</p> : null}

      {job.skills.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {job.skills.map(s => <SkillChip key={s} label={s} />)}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
        {job.matched_skill_count > 0 ? (
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-success)" }}>
            ✓ {job.matched_skill_count} of your skills
          </span>
        ) : <span />}
        <div style={{ display: "inline-flex", gap: 8 }}>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); if (!followDisabled) onToggleFollow() }}
            title={followDisabled ? followDisabledReason : followed ? "Remove from heatmap" : "Add to heatmap · 10 XP"}
            style={{
              padding: "6px 12px", borderRadius: 999, cursor: followDisabled ? "not-allowed" : "pointer",
              fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.04em", fontWeight: 600,
              background: followed ? "var(--tm-int-bg-wash)" : "transparent",
              border: `1px solid ${followed ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`,
              color: followed ? "var(--tm-interactive)" : followDisabled ? "var(--tm-text-faint)" : "var(--tm-text-muted)",
              opacity: followDisabled && !followed ? 0.5 : 1, whiteSpace: "nowrap",
            }}
          >
            {followed ? "✓ In heatmap" : "+ Heatmap"}
          </button>
          {job.source_url ? (
            <a
              href={job.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                padding: "6px 14px", borderRadius: 999, textDecoration: "none",
                fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.04em", fontWeight: 600,
                background: "var(--tm-interactive)", color: "var(--tm-on-interactive, #fff)", whiteSpace: "nowrap",
              }}
            >
              Apply ↗
            </a>
          ) : null}
        </div>
      </div>
    </article>
  )
}

// ── detail drawer ────────────────────────────────────────────────────────────

function JobDetailDrawer({
  job, token, onClose, followed, onToggleFollow,
}: {
  job: JobFeedItem
  token: string
  onClose: () => void
  followed: boolean
  onToggleFollow: () => void
}) {
  const [reported, setReported] = useState(false)
  const [tracked, setTracked] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const reportMut = useMutation({
    mutationFn: () => jobs.reportInactive(token, job.job_id),
    onSuccess: () => { setReported(true); setMsg("Reported — thanks. +10 XP") },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Could not report"),
  })
  const trackMut = useMutation({
    mutationFn: () => jobs.saveJob(token, job.job_id),
    onSuccess: () => { setTracked(true); setMsg("Saved to Tracker") },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Could not save"),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60 }} />
      <aside
        className="tm-feed-drawer"
        role="dialog"
        aria-label={job.job_title}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px, 100vw)", zIndex: 61,
          background: "var(--tm-bg, var(--tm-surface))", borderLeft: "1px solid var(--tm-border-soft)",
          display: "flex", flexDirection: "column", boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "20px 24px", borderBottom: "1px solid var(--tm-border-soft)" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.25 }}>{job.job_title}</h2>
            {job.company_name ? <div style={{ fontSize: 14, color: "var(--tm-interactive)", marginTop: 4 }}>{job.company_name}</div> : null}
            <div style={{ marginTop: 8 }}><LocationLine job={job} /></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 999, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text-muted)", cursor: "pointer", fontSize: 16 }}>×</button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          {job.skills.length > 0 ? (
            <div>
              <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-muted)", marginBottom: 8 }}>Key skills</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{job.skills.map(s => <SkillChip key={s} label={s} />)}</div>
            </div>
          ) : null}
          <div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-muted)", marginBottom: 8 }}>Job description</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.6, color: "var(--tm-text)" }}>{job.job_description || "No description available."}</pre>
          </div>
        </div>

        {msg ? <div style={{ padding: "10px 24px", fontSize: 12, color: "var(--tm-text-muted)", borderTop: "1px solid var(--tm-border-soft)" }}>{msg}</div> : null}

        <footer style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid var(--tm-border-soft)", flexWrap: "wrap" }}>
          {job.source_url ? (
            <a href={job.source_url} target="_blank" rel="noopener noreferrer" style={{ flex: "1 1 auto", textAlign: "center", padding: "11px 16px", borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: 13, background: "var(--tm-interactive)", color: "var(--tm-on-interactive, #fff)" }}>Apply ↗</a>
          ) : null}
          <button type="button" onClick={() => trackMut.mutate()} disabled={tracked || trackMut.isPending} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-text)", fontWeight: 600, fontSize: 13, cursor: tracked ? "default" : "pointer" }}>{tracked ? "✓ Saved" : "Track"}</button>
          <button type="button" onClick={() => onToggleFollow()} style={{ padding: "11px 16px", borderRadius: 10, border: `1px solid ${followed ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`, background: followed ? "var(--tm-int-bg-wash)" : "transparent", color: followed ? "var(--tm-interactive)" : "var(--tm-text-muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{followed ? "✓ Heatmap" : "+ Heatmap"}</button>
          <button type="button" onClick={() => reportMut.mutate()} disabled={reported || reportMut.isPending} title="Report this posting as no longer active" style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid var(--tm-border-soft)", background: "transparent", color: "var(--tm-danger)", fontWeight: 600, fontSize: 13, cursor: reported ? "default" : "pointer" }}>{reported ? "✓ Reported" : "Report inactive"}</button>
        </footer>
      </aside>
    </>
  )
}

// ── filter pills ─────────────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 14px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
        fontSize: 12.5, fontWeight: 500,
        background: active ? "var(--tm-int-bg-wash)" : "var(--tm-surface)",
        border: `1px solid ${active ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`,
        color: active ? "var(--tm-interactive)" : "var(--tm-text-muted)",
        transition: "all 120ms ease",
      }}
    >
      {label}
    </button>
  )
}

// ── tab orchestrator ─────────────────────────────────────────────────────────

export interface MarketJobsTabProps {
  token: string
  analytics: MarketAnalytics | undefined
  targetRoles: string[]
  chipCountMap: Record<string, number>
  selectedCluster: string | null
  onSelectCluster: (cluster: string | null) => void
  locationCity: string
  locationCountry: string
  locationMode: string
  onCity: (v: string) => void
  onCountry: (v: string) => void
  onMode: (v: string) => void
  followedNames: string[]
  onToggleFollow: (name: string) => void
  followLimit: number
  xpBalance: number
}

const FOLLOW_XP_COST = 10
const XP_FLOOR = -30

export function MarketJobsTab(props: MarketJobsTabProps) {
  const {
    token, analytics, targetRoles, chipCountMap, selectedCluster, onSelectCluster,
    locationCity, locationCountry, locationMode, onCity, onCountry, onMode,
    followedNames, onToggleFollow, followLimit, xpBalance,
  } = props

  const [searchInput, setSearchInput] = useState("")
  const [q, setQ] = useState("")
  const [pinnedRole, setPinnedRole] = useState<string | null>(null)
  const [sort, setSort] = useState<JobFeedSort>("fresh")
  const [openJob, setOpenJob] = useState<JobFeedItem | null>(null)

  // Debounce the search box → q.
  useEffect(() => {
    const id = setTimeout(() => setQ(searchInput.trim()), 350)
    return () => clearTimeout(id)
  }, [searchInput])

  const feed = useInfiniteQuery({
    queryKey: ["jobFeed", token, selectedCluster ?? "", pinnedRole ?? "", q, locationCity, locationCountry, locationMode, sort],
    queryFn: ({ pageParam = 1 }) =>
      jobs.feed(token, {
        cluster: pinnedRole ? null : selectedCluster,
        roleDomain: pinnedRole,
        q: q || null,
        locationCity: locationCity || null,
        locationCountry: locationCountry || null,
        locationMode: (locationMode || null) as "onsite" | "hybrid" | "remote" | "unknown" | null,
        sort,
        page: pageParam,
        pageSize: 20,
      }),
    initialPageParam: 1,
    getNextPageParam: last => (last.has_next_page ? last.page + 1 : undefined),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  const allJobs = useMemo(() => feed.data?.pages.flatMap(p => p.jobs) ?? [], [feed.data])
  const total = feed.data?.pages[0]?.available_total ?? 0

  // Infinite-scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) {
        void feed.fetchNextPage()
      }
    }, { rootMargin: "600px" })
    obs.observe(el)
    return () => obs.disconnect()
  }, [feed])

  const clearAll = useCallback(() => {
    setSearchInput(""); setQ(""); setPinnedRole(null)
    onSelectCluster(null); onCity(""); onCountry(""); onMode("")
  }, [onSelectCluster, onCity, onCountry, onMode])

  const followFull = followedNames.length >= followLimit
  const lowXp = xpBalance - FOLLOW_XP_COST < XP_FLOOR

  const activeStatKind: "all" | "company" | "role" | "country" | null = useMemo(() => {
    const noFilters = !selectedCluster && !pinnedRole && !q && !locationCity && !locationCountry && !locationMode
    if (noFilters) return "all"
    if (pinnedRole) return "role"
    if (locationCountry && !selectedCluster && !pinnedRole && !q) return "country"
    return null
  }, [selectedCluster, pinnedRole, q, locationCity, locationCountry, locationMode])

  const cities = analytics?.by_location_city ?? []
  const countries = analytics?.by_location_country ?? []
  const modes = analytics?.by_location_mode ?? []

  return (
    <div>
      {analytics ? (
        <StatCards
          analytics={analytics}
          activeKind={activeStatKind}
          onClear={clearAll}
          onCompany={name => { setPinnedRole(null); onSelectCluster(null); setSearchInput(name); setQ(name) }}
          onRole={role => { onSelectCluster(null); setSearchInput(""); setQ(""); setPinnedRole(role) }}
          onCountry={country => { onCountry(country) }}
        />
      ) : null}

      {/* Search + sort */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 18, flexWrap: "wrap" }} className="tm-feed-searchrow">
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search roles, companies, skills…"
          style={{
            flex: "1 1 280px", minWidth: 0, minHeight: 42, padding: "0 16px", borderRadius: 999,
            border: "1px solid var(--tm-border-soft)", background: "var(--tm-surface)", color: "var(--tm-text)",
            fontSize: 14, outline: "none",
          }}
        />
        <SortBar sort={sort} onSort={setSort} />
      </div>

      {/* Filter pills: target roles + location */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, flexWrap: "wrap" }} className="tm-feed-pillrow">
        {targetRoles.map(role => (
          <Pill
            key={role}
            label={chipCountMap[role] != null ? `${role} · ${chipCountMap[role]}` : role}
            active={selectedCluster === role && !pinnedRole}
            onClick={() => { setPinnedRole(null); onSelectCluster(selectedCluster === role ? null : role) }}
          />
        ))}
        {pinnedRole ? <Pill label={`Role: ${pinnedRole} ✕`} active onClick={() => setPinnedRole(null)} /> : null}
        {countries.length > 0 ? (
          <select value={locationCountry} onChange={e => onCountry(e.target.value)} aria-label="Country" style={selectStyle}>
            <option value="">All countries</option>
            {countries.map(c => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
          </select>
        ) : null}
        {cities.length > 0 ? (
          <select value={locationCity} onChange={e => onCity(e.target.value)} aria-label="City" style={selectStyle}>
            <option value="">All cities</option>
            {cities.map(c => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
          </select>
        ) : null}
        {modes.length > 0 ? (
          <select value={locationMode} onChange={e => onMode(e.target.value)} aria-label="Mode" style={selectStyle}>
            <option value="">All modes</option>
            {modes.map(m => <option key={m.name} value={m.name}>{MODE_LABEL[m.name] ?? m.name} ({m.count})</option>)}
          </select>
        ) : null}
      </div>

      {/* Feed */}
      <div style={{ marginTop: 8 }}>
        {feed.isLoading ? (
          <FeedSkeleton />
        ) : allJobs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--tm-text-muted)", fontSize: 14 }}>
            No openings match these filters. <button type="button" onClick={clearAll} style={{ background: "none", border: "none", color: "var(--tm-interactive)", cursor: "pointer", fontSize: 14, textDecoration: "underline" }}>Clear filters</button>
          </div>
        ) : (
          <>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", margin: "16px 0 12px", letterSpacing: "0.04em" }}>
              {total.toLocaleString()} openings · sorted {SORTS.find(s => s.key === sort)?.label.toLowerCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {allJobs.map(job => {
                const followed = job.company_name ? followedNames.includes(job.company_name) : false
                return (
                  <JobCard
                    key={job.job_id}
                    job={job}
                    followed={followed}
                    onOpen={() => setOpenJob(job)}
                    onToggleFollow={() => job.company_name && onToggleFollow(job.company_name)}
                    followDisabled={!followed && (followFull || lowXp)}
                    followDisabledReason={followFull ? `Heatmap limit ${followLimit}` : lowXp ? "Not enough XP" : undefined}
                  />
                )
              })}
            </div>
            <div ref={sentinelRef} style={{ height: 1 }} />
            {feed.isFetchingNextPage ? <FeedSkeleton rows={2} /> : null}
            {!feed.hasNextPage ? <div style={{ textAlign: "center", padding: "24px", fontSize: 12, color: "var(--tm-text-faint)" }}>— end of feed —</div> : null}
          </>
        )}
      </div>

      {openJob ? (
        <JobDetailDrawer
          job={openJob}
          token={token}
          onClose={() => setOpenJob(null)}
          followed={openJob.company_name ? followedNames.includes(openJob.company_name) : false}
          onToggleFollow={() => openJob.company_name && onToggleFollow(openJob.company_name)}
        />
      ) : null}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  minHeight: 38, padding: "0 12px", borderRadius: 999, border: "1px solid var(--tm-border-soft)",
  background: "var(--tm-surface)", color: "var(--tm-text)", fontSize: 13, cursor: "pointer",
}

function FeedSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 132, borderRadius: "var(--tm-radius-lg)", background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", animation: "pulse 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  )
}
