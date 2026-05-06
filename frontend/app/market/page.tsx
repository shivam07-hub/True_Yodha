"use client"

import { useState, useEffect, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs, scores, users } from "@/lib/api"
import type { JobSearchItem, JobMatch } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { MARKET_LOADING_STEPS, MARKET_LOADING_SUMMARY } from "@/lib/market-loading-copy"
import { useRotatingMessage } from "@/lib/hooks/use-rotating-message"
import { AppShell } from "@/components/app-shell"
import { useAuth } from "@/lib/hooks/use-auth"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import { JobFitPanel } from "@/components/market/job-fit-panel"
import { IntelLoadingState } from "@/components/market/intel-loading-state"
import { useJobsRealtime } from "@/lib/hooks/use-jobs-realtime"

interface TrackJob { job_id: string; job_title: string; company_name: string | null }

function TrackConfirmModal({ job, onConfirm, onClose }: { job: TrackJob; onConfirm: () => void; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", zIndex: 1, width: "min(420px, 90vw)", background: "var(--tm-surface)", border: "1px solid var(--tm-border)", borderRadius: "var(--tm-radius)", padding: "24px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 10, opacity: 0.7 }}>Track this role?</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{job.job_title}</div>
        <div style={{ fontSize: 13, color: "var(--tm-text-faint)", marginBottom: 20 }}>{job.company_name ?? ""}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { onConfirm(); onClose() }} style={{ flex: 1, padding: "9px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)", color: "var(--tm-accent)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Yes, track it →
          </button>
          <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: "var(--tm-radius-sm)", background: "transparent", border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

interface DrillEntity {
  name: string
  roles: number
  skills: string[]
  type: "company" | "industry"
}

function IntelBar({ label, count, max, active, onClick }: {
  label: string; count: number; max: number; active: boolean; onClick: () => void
}) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      aria-label={`${label}, ${count.toLocaleString()} roles`}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "10px 14px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
        background: active ? "var(--tm-accent-wash)" : "transparent",
        border: `1px solid ${active ? "var(--tm-accent-ring)" : "transparent"}`,
        marginBottom: 2, fontFamily: "inherit", outline: "none",
        transition: "background var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease)",
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "var(--tm-hover)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent" } }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--tm-accent-ring)" }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: active ? 600 : 500, marginBottom: 5, textAlign: "left",
          color: active ? "var(--tm-accent)" : "var(--tm-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          transition: "color var(--tm-dur-fast) var(--tm-ease)",
        }}>
          {label}
        </div>
        <div style={{ height: 2, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 999,
            background: active ? "var(--tm-accent)" : "var(--tm-border)",
            transition: "width 0.9s var(--tm-ease), background var(--tm-dur-fast) var(--tm-ease)",
          }} />
        </div>
      </div>
      <div style={{
        fontSize: 12, color: active ? "var(--tm-accent)" : "var(--tm-text-faint)",
        flexShrink: 0, minWidth: 36, textAlign: "right",
        fontVariantNumeric: "tabular-nums", fontWeight: 500,
        transition: "color var(--tm-dur-fast) var(--tm-ease)",
      }}>
        {count.toLocaleString()}
      </div>
      <div style={{
        fontSize: 11, opacity: active ? 1 : 0.3,
        color: active ? "var(--tm-accent)" : "var(--tm-text-faint)",
        transition: "opacity var(--tm-dur-fast) var(--tm-ease), color var(--tm-dur-fast) var(--tm-ease)",
      }} aria-hidden="true">›</div>
    </button>
  )
}

interface DrillSkill {
  company: string
  skill: string
}

const DRILL_PAGE_SIZE = 50

export default function MarketPage() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const [view, setView] = useState<"companies" | "industries">("companies")
  const [selected, setSelected] = useState<DrillEntity | null>(null)
  const [drillSkill, setDrillSkill] = useState<DrillSkill | null>(null)
  const [expandedDesc, setExpandedDesc] = useState<string | null>(null)
  const [trackJob, setTrackJob] = useState<TrackJob | null>(null)
  const [companySearch, setCompanySearch] = useState("")
  const [selectedJobFit, setSelectedJobFit] = useState<JobSearchItem | null>(null)
  const [selectedRole, setSelectedRole] = useState<string>("")
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [selectedCity, setSelectedCity] = useState<string>("")
  const [selectedCountry, setSelectedCountry] = useState<string>("")
  const [selectedMode, setSelectedMode] = useState<string>("")
  const [drillPage, setDrillPage] = useState(1)

  useJobsRealtime()

  const addToTracker = useMutation({
    mutationFn: (jobId: string) => jobs.updateApplication(token!, jobId, { status: "pending" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.applications(token) }),
  })

  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: dataKeys.scores(token),
    queryFn: () => scores.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  const { data: profileData } = useQuery({
    queryKey: dataKeys.profile(token),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  const targetRoles: string[] = useMemo(
    () => profileData?.target_roles ?? [],
    [profileData?.target_roles],
  )

  // Auto-select first (highest priority) target role on initial load
  useEffect(() => {
    if (targetRoles.length > 0 && selectedCluster === null) {
      setSelectedCluster(targetRoles[0])
    }
  }, [targetRoles, selectedCluster])

  const { data: matchesData } = useQuery({
    queryKey: ["job-matches", token],
    queryFn: () => jobs.matches(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  const matchByJobId = (matchesData?.jobs ?? []).reduce<Record<string, JobMatch>>((acc, m) => {
    acc[m.job_id] = m
    return acc
  }, {})

  // Authenticated users get personalized analytics scoped to their target roles.
  // selectedCluster=null means "all their roles combined"; a cluster name filters to one role.
  // Unauthenticated users fall back to the public analytics with optional role_domain filter.
  const usePersonalized = !!token
  const { data: analytics, isLoading } = useQuery({
    queryKey: usePersonalized
      ? dataKeys.jobsAnalyticsMe(token, selectedCluster, selectedCity, selectedCountry, selectedMode)
      : dataKeys.jobsAnalytics(selectedRole, selectedCity, selectedCountry, selectedMode),
    queryFn: usePersonalized
      ? () => jobs.analyticsForMe(token, selectedCluster, {
        locationCity: selectedCity || undefined,
        locationCountry: selectedCountry || undefined,
        locationMode: (selectedMode || undefined) as "onsite" | "hybrid" | "remote" | "unknown" | undefined,
      })
      : () => jobs.analytics(selectedRole || undefined, {
        locationCity: selectedCity || undefined,
        locationCountry: selectedCountry || undefined,
        locationMode: (selectedMode || undefined) as "onsite" | "hybrid" | "remote" | "unknown" | undefined,
      }),
    staleTime: 7 * 24 * 60 * 60 * 1000,
  })

  const hasCv = !scoreLoading && !!scoreData
  const activeRoleFilter = token ? (selectedCluster || "") : selectedRole

  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: dataKeys.jobsSearch(
      drillSkill?.company,
      activeRoleFilter,
      drillSkill?.skill,
      selectedCity,
      selectedCountry,
      selectedMode,
      drillPage,
      DRILL_PAGE_SIZE,
    ),
    queryFn: () =>
      jobs.search(drillSkill!.company, {
        roleDomain: activeRoleFilter || undefined,
        skill: drillSkill!.skill,
        locationCity: selectedCity || undefined,
        locationCountry: selectedCountry || undefined,
        locationMode: (selectedMode || undefined) as "onsite" | "hybrid" | "remote" | "unknown" | undefined,
        page: drillPage,
        pageSize: DRILL_PAGE_SIZE,
      }),
    enabled: !!drillSkill?.company && !!drillSkill?.skill,
    staleTime: 5 * 60 * 1000,
  })

  const companies: DrillEntity[] = (analytics?.by_company ?? []).map((c) => ({
    name: c.name, roles: c.count,
    skills: analytics?.company_skills?.[c.name] ?? [],
    type: "company" as const,
  }))

  const industries: DrillEntity[] = (analytics?.by_industry ?? []).map((ind) => ({
    name: ind.name, roles: ind.count,
    skills: analytics?.industry_skills?.[ind.name] ?? [],
    type: "industry" as const,
  }))

  const baseList = view === "companies" ? companies : industries
  const list = view === "companies" && companySearch.trim()
    ? baseList.filter((e) => e.name.toLowerCase().includes(companySearch.toLowerCase()))
    : baseList
  const max = baseList.reduce((m, e) => Math.max(m, e.roles), 0)
  const roleOptions = analytics?.by_role ?? []
  const cityOptions = (analytics?.by_location_city ?? [])
    .filter((item) => item.name.trim().toLowerCase() !== "unknown")
  const countryOptions = (analytics?.by_location_country ?? [])
    .filter((item) => item.name.trim().toLowerCase() !== "unknown")
  const modeOptions = (analytics?.by_location_mode ?? [])
    .filter((item) => item.name.trim().toLowerCase() !== "unknown")
  const loadingMessage = useRotatingMessage(MARKET_LOADING_STEPS, { enabled: isLoading })
  const marketSummary = analytics
    ? `${analytics.total_jobs.toLocaleString()} jobs in ${analytics.total_companies.toLocaleString()} companies across ${analytics.total_industries.toLocaleString()} industry groups${selectedRole ? ` · role: ${selectedRole}` : ""}${selectedCity ? ` · city: ${selectedCity}` : ""}${selectedCountry ? ` · country: ${selectedCountry}` : ""}${selectedMode ? ` · mode: ${selectedMode}` : ""}`
    : MARKET_LOADING_SUMMARY

  return (
    <>
    {trackJob && token && (
      <TrackConfirmModal
        job={trackJob}
        onConfirm={() => addToTracker.mutate(trackJob.job_id)}
        onClose={() => setTrackJob(null)}
      />
    )}
    <AppShell>
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 4 }}>
            Intel
          </h1>
          <div style={{ fontSize: 12, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
            {marketSummary}
          </div>
        </div>

        <CVRequiredNudge hasCv={hasCv} feature="personalised market intel" />

        {/* Role Filter — pill tabs for authenticated users, dropdown fallback for public */}
        {token ? (
          targetRoles.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginRight: 2 }}>
                Target Roles
              </div>
              {targetRoles.map((role) => {
                const active = selectedCluster === role
                return (
                  <button
                    key={role}
                    onClick={() => {
                      setSelectedCluster(role)
                      setSelected(null)
                      setDrillSkill(null)
                      setDrillPage(1)
                      setExpandedDesc(null)
                      setCompanySearch("")
                      setSelectedJobFit(null)
                    }}
                    style={{
                      padding: "7px 18px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                      background: active ? "var(--tm-accent-wash)" : "var(--tm-hover-soft)",
                      border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                      color: active ? "var(--tm-accent)" : "var(--tm-text-muted)",
                      cursor: "pointer",
                      transition: "all var(--tm-dur) var(--tm-ease)", fontFamily: "inherit",
                    }}
                  >
                    {role}
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ marginBottom: 14, fontSize: 12, color: "var(--tm-text-faint)" }}>
              No target roles set —{" "}
              <button
                onClick={() => document.dispatchEvent(new CustomEvent("tm:open-settings"))}
                style={{ background: "none", border: "none", padding: 0, color: "var(--tm-accent)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", textDecoration: "underline" }}
              >
                Add target roles in Settings →
              </button>
            </div>
          )
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              Role Domain
            </div>
            <select
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value)
                setSelected(null)
                setDrillSkill(null)
                setDrillPage(1)
                setExpandedDesc(null)
                setSelectedJobFit(null)
                setCompanySearch("")
              }}
              className="tm-input"
              style={{ maxWidth: 320, height: 34, fontSize: 12 }}
            >
              <option value="">All roles</option>
              {roleOptions.map((role) => (
                <option key={role.name} value={role.name}>
                  {role.name} ({role.count.toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
            Location
          </div>
          <select
            value={selectedCity}
            onChange={(e) => {
              setSelectedCity(e.target.value)
              setSelected(null)
              setDrillSkill(null)
              setDrillPage(1)
              setExpandedDesc(null)
              setSelectedJobFit(null)
            }}
            className="tm-input"
            style={{ maxWidth: 220, height: 34, fontSize: 12 }}
          >
            <option value="">All cities</option>
            {cityOptions.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.count.toLocaleString()})
              </option>
            ))}
          </select>
          <select
            value={selectedCountry}
            onChange={(e) => {
              setSelectedCountry(e.target.value)
              setSelected(null)
              setDrillSkill(null)
              setDrillPage(1)
              setExpandedDesc(null)
              setSelectedJobFit(null)
            }}
            className="tm-input"
            style={{ maxWidth: 220, height: 34, fontSize: 12 }}
          >
            <option value="">All countries</option>
            {countryOptions.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.count.toLocaleString()})
              </option>
            ))}
          </select>
          <select
            value={selectedMode}
            onChange={(e) => {
              setSelectedMode(e.target.value)
              setSelected(null)
              setDrillSkill(null)
              setDrillPage(1)
              setExpandedDesc(null)
              setSelectedJobFit(null)
            }}
            className="tm-input"
            style={{ maxWidth: 180, height: 34, fontSize: 12 }}
          >
            <option value="">All modes</option>
            {modeOptions.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.count.toLocaleString()})
              </option>
            ))}
          </select>
          {(selectedCity || selectedCountry || selectedMode) && (
            <button
              onClick={() => {
                setSelectedCity("")
                setSelectedCountry("")
                setSelectedMode("")
                setSelected(null)
                setDrillSkill(null)
                setDrillPage(1)
                setExpandedDesc(null)
                setSelectedJobFit(null)
              }}
              className="tm-btn tm-btn-ghost"
              style={{ height: 34, fontSize: 12, padding: "0 12px" }}
            >
              Clear location
            </button>
          )}
        </div>

        {/* Toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {(["companies", "industries"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setSelected(null); setDrillSkill(null); setDrillPage(1); setExpandedDesc(null); setCompanySearch(""); setSelectedJobFit(null) }}
              style={{
                padding: "7px 18px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                background: view === v ? "var(--tm-accent-wash)" : "var(--tm-hover-soft)",
                border: `1px solid ${view === v ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                color: view === v ? "var(--tm-accent)" : "var(--tm-text-muted)",
                cursor: "pointer", textTransform: "capitalize",
                transition: "all var(--tm-dur) var(--tm-ease)", fontFamily: "inherit",
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <IntelLoadingState message={loadingMessage} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: selectedJobFit ? "1fr 1fr 280px" : "1fr 1fr", gap: 16, transition: "grid-template-columns 0.25s ease" }}>
            {/* Bars */}
            <div style={{
              background: "var(--tm-surface)",
              border: "1px solid var(--tm-border-soft)",
              borderRadius: "var(--tm-radius)",
              padding: 16,
              display: "flex", flexDirection: "column",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", opacity: 0.6 }}>
                  {view === "companies" ? `All Companies · ${list.length}` : "Industry Breakdown"}
                </div>
                {view === "companies" && (
                  <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                    {analytics?.total_companies ?? 0} total
                  </span>
                )}
              </div>

              {view === "companies" && (
                <input
                  value={companySearch}
                  onChange={(e) => { setCompanySearch(e.target.value); setSelected(null) }}
                  placeholder="Search companies…"
                  className="tm-input"
                  style={{ marginBottom: 10, height: 34, fontSize: 12 }}
                />
              )}

              <div style={{ overflowY: "auto", maxHeight: 480 }}>
                {list.length === 0 ? (
                  <div style={{ color: "var(--tm-text-faint)", fontSize: 14, padding: "32px 0", textAlign: "center" }}>
                    {companySearch ? `No companies matching "${companySearch}"` : "No data yet"}
                  </div>
                ) : (
                  list.map((entity) => (
                    <IntelBar
                      key={entity.name}
                      label={entity.name}
                      count={entity.roles}
                      max={max}
                      active={selected?.name === entity.name}
                      onClick={() => { setSelected(entity.name === selected?.name ? null : entity); setDrillSkill(null); setDrillPage(1); setExpandedDesc(null) }}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Right panel — skills or job drill */}
            <div style={{
              background: "var(--tm-surface)",
              border: "1px solid var(--tm-border-soft)",
              borderRadius: "var(--tm-radius)",
              padding: 16,
              overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}>
              {drillSkill && selected?.type === "company" ? (
                /* ── Job drill-down view ── */
                <>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <button
                      onClick={() => { setDrillSkill(null); setDrillPage(1); setExpandedDesc(null) }}
                      style={{
                        background: "none", border: "1px solid var(--tm-border-soft)",
                        borderRadius: 6, color: "var(--tm-text-muted)", cursor: "pointer",
                        padding: "3px 8px", fontSize: 12, fontFamily: "inherit",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--tm-accent-ring)"; e.currentTarget.style.color = "var(--tm-accent)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--tm-border-soft)"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                    >
                      ← Back
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {drillSkill.company}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--tm-accent)", marginTop: 1 }}>
                        Skill: {drillSkill.skill} · {drillLoading ? "…" : `${drillData?.available_total ?? 0} matching jobs`}
                      </div>
                    </div>
                  </div>

                  {/* Column headers */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "2fr 2fr 2fr 3fr",
                    gap: 8, padding: "6px 10px", marginBottom: 6,
                    borderBottom: "1px solid var(--tm-border-soft)",
                  }}>
                    {["Job ID", "Job Title", "Location", "Description"].map((h) => (
                      <div key={h} style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>{h}</div>
                    ))}
                  </div>

                  {/* Rows */}
                  <div style={{ overflowY: "auto", flex: 1, maxHeight: 420 }}>
                    {drillLoading ? (
                      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 13 }}>
                        Loading jobs…
                      </div>
                    ) : !drillData?.jobs.length ? (
                      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 13 }}>
                        No matching jobs found
                      </div>
                    ) : (
                      drillData.jobs.map((job: JobSearchItem) => {
                        const isOpen = expandedDesc === job.job_id
                        const shortDesc = (job.job_description || "").slice(0, 120)
                        const hasMore = (job.job_description || "").length > 120
                        return (
                          <div
                            key={job.job_id}
                            style={{
                              display: "grid", gridTemplateColumns: "2fr 2fr 2fr 3fr",
                              gap: 8, padding: "9px 10px",
                              borderBottom: "1px solid var(--tm-border-soft)",
                              transition: "background 0.12s",
                              cursor: "default",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--tm-hover-soft)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            {/* Job ID */}
                            <div style={{
                              fontSize: 11, color: "var(--tm-text-faint)",
                              fontFamily: "monospace", letterSpacing: "0.02em",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              paddingTop: 1,
                            }}>
                              {job.job_id}
                            </div>
                            {/* Title */}
                            <div
                              onClick={() => setSelectedJobFit(job)}
                              style={{
                                fontSize: 12, fontWeight: 500, color: selectedJobFit?.job_id === job.job_id ? "var(--tm-accent)" : "var(--tm-text)",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                cursor: "pointer",
                                textDecoration: "underline",
                                textDecorationColor: selectedJobFit?.job_id === job.job_id ? "var(--tm-accent-ring)" : "var(--tm-border-soft)",
                              }}
                            >
                              {job.job_title || "—"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--tm-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {job.location || [job.location_city, job.location_country].filter(Boolean).join(", ") || "Unknown"}
                            </div>
                            {/* Description */}
                            <div style={{ fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.5 }}>
                              {isOpen ? (job.job_description || "No description") : (shortDesc + (hasMore ? "…" : "") || "No description")}
                              {hasMore && (
                                <button
                                  onClick={() => setExpandedDesc(isOpen ? null : job.job_id)}
                                  style={{
                                    marginLeft: 5, background: "none", border: "none",
                                    color: "var(--tm-accent)", cursor: "pointer", fontSize: 11,
                                    fontFamily: "inherit", padding: 0, textDecoration: "underline",
                                  }}
                                >
                                  {isOpen ? "less" : "more"}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                  {drillData && drillData.available_total > 0 && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: "1px solid var(--tm-border-soft)",
                    }}>
                      <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                        Showing {drillData.returned_total.toLocaleString()} of {drillData.available_total.toLocaleString()} · page {drillData.page}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setDrillPage((p) => Math.max(1, p - 1))}
                          disabled={drillData.page <= 1 || drillLoading}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--tm-border-soft)",
                            background: "transparent",
                            color: "var(--tm-text-muted)",
                            fontSize: 11,
                            fontFamily: "inherit",
                            cursor: drillData.page <= 1 || drillLoading ? "not-allowed" : "pointer",
                            opacity: drillData.page <= 1 || drillLoading ? 0.45 : 1,
                          }}
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => setDrillPage((p) => p + 1)}
                          disabled={!drillData.has_next_page || drillLoading}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--tm-accent-ring)",
                            background: "var(--tm-accent-wash)",
                            color: "var(--tm-accent)",
                            fontSize: 11,
                            fontFamily: "inherit",
                            cursor: !drillData.has_next_page || drillLoading ? "not-allowed" : "pointer",
                            opacity: !drillData.has_next_page || drillLoading ? 0.45 : 1,
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : selected ? (
                /* ── Skills list view ── */
                <>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: "var(--tm-accent)", marginBottom: 14 }}>
                    {selected.roles.toLocaleString()} open roles
                  </div>
                  {selected.skills.length > 0 ? (
                    <>
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
                        {selected.type === "company" ? "Click a skill to see matching jobs" : "Skills in demand"}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {[...selected.skills].slice(0, 10).map((s) => (
                          <div
                            key={s}
                            onClick={() => {
                              if (selected.type !== "company") return
                              setDrillSkill({ company: selected.name, skill: s })
                              setDrillPage(1)
                            }}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
                              background: "var(--tm-accent-wash)",
                              cursor: selected.type === "company" ? "pointer" : "default",
                              border: "1px solid transparent",
                              transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => { if (selected.type === "company") { e.currentTarget.style.borderColor = "var(--tm-accent-ring)"; e.currentTarget.style.background = "var(--tm-accent-wash)" } }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "var(--tm-accent-wash)" }}
                          >
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--tm-accent)", boxShadow: "0 0 6px var(--tm-accent-glow)", flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 13, color: "var(--tm-text)" }}>{s}</span>
                            {selected.type === "company" && (
                              <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>›</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: "var(--tm-text-faint)", fontSize: 13, padding: "16px 0" }}>No skill breakdown available.</div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "var(--tm-text-faint)", fontSize: 14 }}>
                  <div style={{ fontSize: 33, marginBottom: 12, opacity: 0.3, color: "var(--tm-accent)" }}>◉</div>
                  Select a {view === "companies" ? "company" : "industry"} to see skills
                </div>
              )}
            </div>

            {/* Fit panel — 3rd col, shown when a job is selected */}
            {selectedJobFit && (
              <div style={{
                background: "var(--tm-surface)",
                border: "1px solid var(--tm-border-soft)",
                borderRadius: "var(--tm-radius)",
                padding: 16,
                overflow: "hidden",
                display: "flex", flexDirection: "column",
                maxHeight: 540,
                animation: "tm-fade-up 0.2s ease",
              }}>
                <JobFitPanel
                  job={selectedJobFit}
                  matchData={matchByJobId[selectedJobFit.job_id]}
                  gapSkills={scoreData?.gap_skills ?? []}
                  onClose={() => setSelectedJobFit(null)}
                  onTrack={() => setTrackJob({ job_id: selectedJobFit.job_id, job_title: selectedJobFit.job_title, company_name: selectedJobFit.company_name })}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
    </>
  )
}
