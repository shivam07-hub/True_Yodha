"use client"

import { useState, useMemo, useCallback, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query"
import { jobs, users, xp } from "@/lib/api"
import type { JobSearchItem, UserSkillDemandItem, FollowedCompany, JobLocationFilters } from "@/lib/api"
import { MarketJobsTab } from "@/components/market/jobs-tab"
import { useAuth } from "@/lib/hooks/use-auth"
import { useFollowCompany } from "@/lib/hooks/use-follow-company"
import { useXPStore } from "@/store/xpStore"
import { XP_POLICY } from "@/lib/xp-policy"
import { shortHeatmapSkillLabel } from "@/lib/heatmap-labels"

// ── Job drill-down panel ─────────────────────────────────────────────────────

function LocationBadge({ mode }: { mode: string | null | undefined }) {
  if (!mode || mode === "unknown") return null
  const labels: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }
  const colors: Record<string, string> = {
    remote: "var(--tm-int-border-soft)",
    hybrid: "color-mix(in oklab, var(--tm-warning) 14%, transparent)",
    onsite: "color-mix(in oklab, var(--tm-text-faint) 12%, transparent)",
  }
  return (
    <span style={{
      fontSize: 10, fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em",
      padding: "2px 7px", borderRadius: 99, background: colors[mode] ?? "color-mix(in oklab, var(--tm-text-faint) 12%, transparent)",
      color: "var(--tm-text-muted)", textTransform: "uppercase",
    }}>
      {labels[mode] ?? mode}
    </span>
  )
}

function JobDrillPanel({
  companyName, skillName, drillJobs, isLoading, savedJobIds, onSave, onClose, isLoggedIn,
}: {
  companyName: string; skillName: string; drillJobs: JobSearchItem[]; isLoading: boolean
  savedJobIds: Set<string>; onSave: (job: JobSearchItem) => void; onClose: () => void; isLoggedIn: boolean
}) {
  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", marginTop: 4, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid var(--tm-border-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-interactive)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{companyName}</span>
          <span style={{ color: "var(--tm-text-faint)", fontSize: 11 }}>×</span>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{skillName}</span>
          {!isLoading && <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, color: "var(--tm-text-faint)", marginLeft: 4 }}>· {drillJobs.length} jobs</span>}
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)", padding: "4px 12px", color: "var(--tm-text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "var(--tm-font-mono)" }}>
          ← Close
        </button>
      </div>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {isLoading ? (
          <div style={{ padding: "24px", color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", fontSize: 12 }}>Loading jobs…</div>
        ) : drillJobs.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", fontSize: 12 }}>No jobs found for this combination.</div>
        ) : (
          drillJobs.map((job, idx) => {
            const isSaved = savedJobIds.has(job.job_id)
            return (
              <div key={job.job_id} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "14px 24px", borderBottom: idx < drillJobs.length - 1 ? "1px solid var(--tm-border-soft)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 9, color: "var(--tm-text-faint)", letterSpacing: "0.06em", flexShrink: 0 }}>{job.job_id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.job_title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                    {(job.location_city || job.location_country) && <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>{[job.location_city, job.location_country].filter(Boolean).join(", ")}</span>}
                    <LocationBadge mode={job.location_mode} />
                  </div>
                  {job.job_description && <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 6, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{job.job_description}</div>}
                </div>
                {isLoggedIn && (
                  <button onClick={() => onSave(job)} disabled={isSaved} style={{ flexShrink: 0, fontSize: 11, fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em", padding: "5px 14px", borderRadius: "var(--tm-radius-sm)", cursor: isSaved ? "default" : "pointer", background: isSaved ? "var(--tm-int-bg-wash)" : "transparent", border: `1px solid ${isSaved ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`, color: isSaved ? "var(--tm-interactive)" : "var(--tm-text-muted)", transition: "all 150ms ease" }}>
                    {isSaved ? "Saved ✓" : "Save →"}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Shimmer cell ─────────────────────────────────────────────────────────────

function ShimmerCell() {
  return (
    <td style={{ width: 36, height: 28 }}>
      <div style={{ width: 28, height: 18, borderRadius: 4, background: "var(--tm-border-soft)", animation: "pulse 1.4s ease-in-out infinite", margin: "auto" }} />
    </td>
  )
}

function CVPrerequisiteCard({
  readiness,
  errorCode,
}: {
  readiness: "missing" | "processing" | "failed"
  errorCode?: string | null
}) {
  const title =
    readiness === "processing"
      ? "Your CV analysis is running"
      : readiness === "failed"
        ? "CV analysis needs retry"
        : "Upload a CV to unlock personalized Live Job Data"

  const body =
    readiness === "processing"
      ? "We are still mapping your skills. You can keep exploring market demand while your personal heatmap prepares."
      : readiness === "failed"
        ? "Your last CV analysis did not complete. Re-upload to restore skill-to-company heatmap personalization."
        : "Your company heatmap is built from skills extracted from your CV. Upload once to activate personalized demand mapping."

  return (
    <div
      style={{
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-radius-lg)",
        marginTop: 14,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)" }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--tm-text-faint)", maxWidth: 720 }}>{body}</div>
      {readiness === "failed" && errorCode ? (
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--tm-warning)" }}>
          LAST ERROR · {errorCode.toUpperCase()}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
        <Link
          href={readiness === "failed" ? "/cv?upload=1" : "/cv"}
          style={{
            padding: "8px 14px",
            borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-interactive)",
            color: "var(--tm-interactive-fg)",
            border: "1px solid var(--tm-interactive)",
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {readiness === "processing" ? "View upload status →" : readiness === "failed" ? "Retry CV upload →" : "Upload CV →"}
        </Link>
        <Link
          href="/about"
          style={{
            padding: "8px 14px",
            borderRadius: "var(--tm-radius-sm)",
            background: "transparent",
            color: "var(--tm-text-faint)",
            border: "1px solid var(--tm-border-soft)",
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          See how Live Job Data works
        </Link>
      </div>
    </div>
  )
}

// ── Skill × Company heatmap ──────────────────────────────────────────────────

function SkillHeatmap({
  companies,
  rowDataMap,
  skills,
  skillLevels,
  selectedCell,
  onCellSelect,
  allSkills,
  selectedSkillNames,
  onToggleSkill,
  isLoggedIn,
}: {
  companies: FollowedCompany[]
  rowDataMap: Record<string, Record<string, number> | null>
  skills: string[]
  skillLevels: Record<string, number>
  selectedCell: { ci: number; si: number } | null
  onCellSelect: (ci: number, si: number) => void
  allSkills: UserSkillDemandItem[]
  selectedSkillNames: Set<string>
  onToggleSkill: (name: string) => void
  isLoggedIn: boolean
}) {
  const [hoverCell, setHoverCell] = useState<{ ci: number; si: number } | null>(null)
  const [hoveredCol, setHoveredCol] = useState<string | null>(null)
  const [showSkillPicker, setShowSkillPicker] = useState(false)

  const maxVal = useMemo(() => {
    let max = 1
    for (const rowData of Object.values(rowDataMap)) {
      if (!rowData) continue
      for (const v of Object.values(rowData)) {
        if (v > max) max = v
      }
    }
    return max
  }, [rowDataMap])

  // Empty state
  if (companies.length === 0) {
    return (
      <div style={{
        background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-radius-lg)", marginTop: 14,
        padding: "48px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)", marginBottom: 8 }}>Your heatmap is empty</div>
        <div style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>
          Tap “+ Heatmap” on companies in the list above to add them here.
          Each follow costs {XP_POLICY.followCompanyCost} XP — up to {XP_POLICY.followedCompanyLimit} companies.
        </div>
      </div>
    )
  }

  if (!skills.length) return null

  const selectedCount = selectedSkillNames.size

  return (
    <div className="tm-intel-heatmap" style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", marginTop: 14, overflow: "hidden" }}>
      {/* Header row */}
      <div className="tm-intel-heatmap-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "18px 24px 16px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>YOUR SKILLS × COMPANY DEMAND</div>
          <div className="tm-intel-heatmap-title" style={{ fontSize: 18, fontWeight: 600, marginTop: 8, color: "var(--tm-text)", lineHeight: 1.25 }}>Where to invest your skill points</div>
        </div>
        <div className="tm-intel-heatmap-controls" style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, paddingTop: 4 }}>
          {isLoggedIn && allSkills.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowSkillPicker(p => !p)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6,
                  background: showSkillPicker ? "var(--tm-int-bg-wash)" : "transparent",
                  border: `1px solid ${showSkillPicker ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`,
                  color: showSkillPicker ? "var(--tm-interactive)" : "var(--tm-text-faint)",
                  fontFamily: "var(--tm-font-mono)", fontSize: 10, cursor: "pointer",
                  letterSpacing: "0.06em", transition: "all 120ms ease",
                }}
              >
                COLUMNS · {skills.length}
                <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>▾</span>
              </button>
              {showSkillPicker && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowSkillPicker(false)} />
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0,
                    background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
                    borderRadius: 8, padding: "6px 0", minWidth: 220, zIndex: 100,
                    boxShadow: "var(--tm-shadow-2)", maxHeight: 320, overflowY: "auto",
                  }}>
                    {allSkills.map(s => {
                      const active = selectedSkillNames.has(s.display_name)
                      const canToggle = !active || selectedCount > 1
                      return (
                        <button
                          key={s.display_name}
                          onClick={() => { if (canToggle) onToggleSkill(s.display_name) }}
                          disabled={!canToggle}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, width: "100%",
                            padding: "7px 14px", background: "transparent", border: "none",
                            cursor: canToggle ? "pointer" : "default",
                            color: active ? "var(--tm-text)" : "var(--tm-text-faint)",
                            fontFamily: "var(--tm-font-mono)", fontSize: 11, textAlign: "left",
                            opacity: !canToggle ? 0.4 : 1, transition: "background 80ms",
                          }}
                          onMouseEnter={e => { if (canToggle) (e.currentTarget as HTMLElement).style.background = "var(--tm-hover-soft)" }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                        >
                          <span style={{
                            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                            background: active ? "var(--tm-interactive)" : "transparent",
                            border: `1px solid ${active ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {active && <span style={{ fontSize: 8, color: "var(--tm-bg)", fontWeight: 800 }}>✓</span>}
                          </span>
                          {s.display_name}
                          <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--tm-text-faint)", fontWeight: 700 }}>L{s.current_level}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "var(--tm-font-mono)", color: "var(--tm-text-faint)", letterSpacing: "0.06em" }}>
            LOW
            <div style={{ display: "flex", gap: 2 }}>
              {[0.1, 0.3, 0.5, 0.7, 0.95].map(o => (
                <div key={o} style={{ width: 14, height: 12, background: `color-mix(in oklab, var(--data-1) ${Math.round(o * 100)}%, transparent)`, borderRadius: 2 }} />
              ))}
            </div>
            HIGH
          </div>
        </div>
      </div>

      <div className="tm-intel-heatmap-scroll" style={{ overflowX: "auto" }}>
        <table className="tm-intel-heatmap-table" style={{ borderCollapse: "separate", borderSpacing: 4, padding: "0 24px 24px", fontFamily: "var(--tm-font-mono)" }}>
          <thead>
            <tr>
              <th className="tm-intel-company-th" style={{ width: 180, minWidth: 140 }} />
              {skills.map(sk => {
                const level = skillLevels[sk.toLowerCase()] ?? 0
                const isHovered = hoveredCol === sk
                const canRemove = selectedCount > 1
                return (
                  <th
                    key={sk}
                    onMouseEnter={() => setHoveredCol(sk)}
                    onMouseLeave={() => setHoveredCol(null)}
                    onClick={() => { if (canRemove) onToggleSkill(sk) }}
                    title={canRemove ? `Click to hide ${sk}` : "Keep at least one column"}
                    className="tm-intel-skill-th"
                    style={{
                      padding: "8px 6px",
                      fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em",
                      fontWeight: 600, textAlign: "center", minWidth: 72, maxWidth: 92, verticalAlign: "bottom",
                      cursor: canRemove ? "pointer" : "default",
                      color: isHovered && canRemove ? "var(--tm-danger)" : "var(--tm-text-muted)",
                      transition: "color 100ms ease",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: isHovered && canRemove ? "var(--tm-danger)" : level >= 3 ? "var(--tm-interactive)" : level >= 1 ? "var(--tm-text-faint)" : "transparent" }}>
                        {isHovered && canRemove ? "×" : `L${level}`}
                      </span>
                      <span
                        aria-label={sk}
                        style={{ display: "block", maxWidth: 82, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {shortHeatmapSkillLabel(sk)}
                      </span>
                    </div>
                  </th>
                )
              })}
              <th style={{ padding: "0 8px", fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.08em", fontWeight: 500 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((co, ci) => {
              const rowData = rowDataMap[co.company_name]
              const isLoading = rowData === null
              const rowSum = rowData ? skills.reduce((s, sk) => s + (rowData[sk] ?? 0), 0) : null
              const isEmpty = !isLoading && rowSum === 0
              return (
                <tr key={co.company_name} style={{ opacity: isEmpty ? 0.5 : 1 }}>
                  <td className="tm-intel-company-td" style={{ paddingRight: 12, fontSize: 13, color: "var(--tm-text)", fontFamily: "var(--tm-font-sans)", fontWeight: 500, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--tm-warning)", flexShrink: 0 }} />
                      <Link href={`/companies/${encodeURIComponent(co.company_name)}`} style={{ color: "inherit", textDecoration: "none" }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-interactive)" }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-text)" }}>
                        {co.company_name}
                      </Link>
                    </span>
                  </td>
                  {isLoading ? (
                    skills.map((_, si) => <ShimmerCell key={si} />)
                  ) : isEmpty ? (
                    skills.map((_, si) => (
                      <td
                        key={si}
                        title="No roles match this company and skill yet"
                        style={{
                          width: 44, height: 32, textAlign: "center",
                          background: "var(--tm-bg-inset)",
                          border: "1px solid var(--tm-border-soft)",
                          borderRadius: 5, fontSize: 12,
                          color: "var(--tm-text-faint)",
                        }}
                      >
                        —
                      </td>
                    ))
                  ) : (
                    skills.map((sk, si) => {
                      const v = rowData?.[sk] ?? 0
                      const o = v / maxVal
                      const isHover = hoverCell?.ci === ci && hoverCell?.si === si
                      const isSel = selectedCell?.ci === ci && selectedCell?.si === si
                      return (
                        <td
                          key={si}
                          onMouseEnter={() => setHoverCell({ ci, si })}
                          onMouseLeave={() => setHoverCell(null)}
                          onClick={() => onCellSelect(ci, si)}
                          style={{
                            width: 44, height: 32, cursor: "pointer", textAlign: "center",
                            background: `color-mix(in oklab, var(--data-1) ${Math.round((0.06 + o * 0.85) * 100)}%, transparent)`,
                            border: isSel ? "1px solid var(--tm-interactive)" : isHover ? "1px solid var(--tm-int-border)" : "1px solid transparent",
                            borderRadius: 4, fontSize: 11,
                            color: o > 0.5 ? "var(--tm-bg)" : "var(--tm-text)",
                            fontWeight: 600, transition: "background 150ms ease",
                          }}
                        >
                          {v || ""}
                        </td>
                      )
                    })
                  )}
                  <td style={{ padding: "0 8px", fontSize: 11, color: "var(--tm-text-muted)", fontWeight: 600 }}>
                    {isLoading ? <div style={{ width: 20, height: 10, borderRadius: 2, background: "var(--tm-border-soft)", animation: "pulse 1.4s ease-in-out infinite" }} /> : (rowSum || "")}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Top Movers ───────────────────────────────────────────────────────────────

// ── Skill Selector Panel ─────────────────────────────────────────────────────

// ── Page ─────────────────────────────────────────────────────────────────────

function IntelPageInner() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const { balance: xpBalance, setBalance: setXPBalance } = useXPStore()
  const searchParams = useSearchParams()
  const paramSkill = searchParams.get("skill")

  const [selectedCell, setSelectedCell] = useState<{ ci: number; si: number } | null>(null)
  const [manualSaved, setManualSaved] = useState<Set<string>>(new Set())
  const [selectedSkillNames, setSelectedSkillNames] = useState<Set<string>>(new Set())
  const [skillsInitialized, setSkillsInitialized] = useState(false)
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  // Intel/heatmap analytics stay on the FULL market (facets are unscoped); the
  // job feed is scoped server-side from the user's saved location prefs. The UI
  // no longer re-asks for geo, so these are fixed empty here.
  const locationCity = ""
  const locationCountry = ""
  const locationMode = ""
  const [activeTab, setActiveTab] = useState<"jobs" | "heatmap">("jobs")

  // Sync XP balance if not yet set from another page visit
  useQuery({
    queryKey: ["xpBalance", token],
    queryFn: async () => {
      const r = await xp.balance(token!)
      setXPBalance(r.balance)
      return r
    },
    enabled: !!token && xpBalance === 0,
    staleTime: 60 * 1000,
  })

  // Profile — needed for target_roles
  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const targetRoles: string[] = useMemo(
    () => profileData?.target_roles ?? [],
    [profileData?.target_roles]
  )
  const cvReadiness = useMemo<"ready" | "missing" | "processing" | "failed">(() => {
    if (!token) return "ready"
    if (profileData?.has_cv) return "ready"
    return profileData?.cv_readiness ?? "missing"
  }, [token, profileData?.cv_readiness, profileData?.has_cv])
  const cvReadyForPersonalization = cvReadiness === "ready"

  const locFilters = useMemo(
    () => ({
      locationCity: locationCity || null,
      locationCountry: locationCountry || null,
      locationMode: (locationMode || null) as JobLocationFilters["locationMode"],
    }),
    [locationCity, locationCountry, locationMode]
  )

  const { data: analytics } = useQuery({
    queryKey: ["intel-analytics", token ?? "", selectedCluster ?? "", locationCity, locationCountry, locationMode],
    queryFn: () =>
      token
        ? jobs.analyticsForMe(token, selectedCluster || null, locFilters)
        : jobs.analytics(undefined, locFilters),
    staleTime: 7 * 24 * 60 * 60 * 1000,
  })

  // Per-chip counts — one lightweight call per target role
  const chipCountQueries = useQueries({
    queries: targetRoles.map(role => ({
      queryKey: ["intel-chip-count", token ?? "", role, locationCity, locationCountry, locationMode],
      queryFn: () => jobs.analyticsForMe(token!, role, locFilters),
      enabled: !!token && targetRoles.length > 0,
      staleTime: 30 * 60 * 1000,
    })),
  })

  const chipCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    targetRoles.forEach((role, i) => {
      const q = chipCountQueries[i]
      if (q?.data?.total_jobs != null) map[role] = q.data.total_jobs
    })
    return map
  }, [targetRoles, chipCountQueries])

  // Optimistic follow/unfollow + IH2 gating, shared with Settings.
  const following = useFollowCompany(token)
  const followedCompanies = following.companies
  const followedNames = following.followedNames

  const { data: skillDemandData } = useQuery({
    queryKey: ["mySkillDemand", token],
    queryFn: () => jobs.mySkillDemand(token!),
    enabled: !!token && cvReadyForPersonalization,
    staleTime: 30 * 60 * 1000,
  })

  // Seed selected skills from top-8 mySkillDemand on first load.
  // If ?skill= param present (navigating from Skills page), pin that skill first.
  useEffect(() => {
    if (skillDemandData?.skills?.length && !skillsInitialized) {
      const sorted = skillDemandData.skills
        .filter(s => s.weighted_demand > 0)
        .sort((a, b) => b.weighted_demand - a.weighted_demand)
        .map(s => s.display_name)
      if (paramSkill) {
        const rest = sorted.filter(s => s !== paramSkill)
        setSelectedSkillNames(new Set([paramSkill, ...rest]))
      } else {
        setSelectedSkillNames(new Set(sorted))
      }
      setSkillsInitialized(true)
    }
  }, [skillDemandData, skillsInitialized, paramSkill])

  // Auto-select first target role chip when profile loads
  useEffect(() => {
    if (targetRoles.length > 0 && !selectedCluster) {
      setSelectedCluster(targetRoles[0])
    }
  }, [targetRoles, selectedCluster])

  // Heatmap columns: always CV skills (user-curated via Skill Lens)
  const heatmapSkills = useMemo(() => {
    if (!cvReadyForPersonalization) return []
    if (!skillDemandData?.skills?.length) return []
    const base = skillDemandData.skills
      .filter(s => selectedSkillNames.size === 0 || selectedSkillNames.has(s.display_name))
      .sort((a, b) => b.weighted_demand - a.weighted_demand)
      .map(s => s.display_name)
    // Pin param skill as first column when navigating from Skills page
    if (paramSkill && base.includes(paramSkill)) {
      return [paramSkill, ...base.filter(s => s !== paramSkill)]
    }
    return base
  }, [cvReadyForPersonalization, selectedSkillNames, skillDemandData, paramSkill])

  const skillLevels = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of skillDemandData?.skills ?? []) {
      map[s.display_name.toLowerCase()] = s.current_level
    }
    return map
  }, [skillDemandData])

  // Per-company heatmap row queries — include location filters in cache key so they refetch on filter change
  const heatmapRowQueries = useQueries({
    queries: followedCompanies.map(co => ({
      queryKey: ["heatmapRow", co.company_name, heatmapSkills.join(","), locationCity, locationCountry, locationMode],
      queryFn: () => jobs.skillHeatmapRow(co.company_name, heatmapSkills, locFilters),
      enabled: heatmapSkills.length > 0,
      staleTime: 30 * 60 * 1000,
    })),
  })

  // company_name → skill→count (null while loading)
  const rowDataMap = useMemo(() => {
    const map: Record<string, Record<string, number> | null> = {}
    followedCompanies.forEach((co, i) => {
      const q = heatmapRowQueries[i]
      map[co.company_name] = q?.data?.matrix?.[co.company_name] ?? null
    })
    return map
  }, [followedCompanies, heatmapRowQueries])

  // Resolved cell for drill-down
  const resolvedCell = useMemo(() => {
    if (!selectedCell) return null
    const company = followedCompanies[selectedCell.ci]
    const skill = heatmapSkills[selectedCell.si]
    if (!company || !skill) return null
    return { companyName: company.company_name, skillName: skill }
  }, [selectedCell, followedCompanies, heatmapSkills])

  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ["cellJobs", resolvedCell?.companyName, resolvedCell?.skillName],
    queryFn: () => jobs.search(resolvedCell!.companyName, { skill: resolvedCell!.skillName, pageSize: 50 }),
    enabled: !!resolvedCell,
    staleTime: 10 * 60 * 1000,
  })

  const saveMutation = useMutation({
    mutationFn: (jobId: string) => jobs.saveJob(token!, jobId),
    onSuccess: (_data, jobId) => {
      setManualSaved(prev => new Set(Array.from(prev).concat(jobId)))
      queryClient.invalidateQueries({ queryKey: ["applications"] })
    },
  })

  const handleToggleSkill = useCallback((name: string) => {
    setSelectedSkillNames(prev => {
      const next = new Set(prev)
      if (next.has(name)) { if (next.size > 1) next.delete(name) }
      else next.add(name)
      return next
    })
  }, [])

  const handleCellSelect = useCallback((ci: number, si: number) => {
    setSelectedCell(prev => (prev?.ci === ci && prev?.si === si ? null : { ci, si }))
  }, [])

  useEffect(() => {
    if (!cvReadyForPersonalization && selectedCell) setSelectedCell(null)
  }, [cvReadyForPersonalization, selectedCell])

  const savedJobIds = useMemo(() => new Set(Array.from(manualSaved)), [manualSaved])

  const TABS: { key: "jobs" | "heatmap"; label: string }[] = [
    { key: "jobs", label: "Jobs" },
    { key: "heatmap", label: "Heatmap" },
  ]

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media (max-width: 768px) {
          .tm-intel-page {
            padding: 22px 18px 96px !important;
          }
          .tm-intel-page h1 {
            font-size: 30px !important;
            line-height: 1.08 !important;
            letter-spacing: -0.03em !important;
          }
          .tm-feed-statcards {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }
          .tm-feed-searchrow { gap: 10px !important; }
          .tm-feed-drawer { width: 100vw !important; }
          .tm-intel-heatmap-head {
            flex-direction: column;
            padding: 20px 18px 14px !important;
          }
          .tm-intel-heatmap-title {
            font-size: 28px !important;
            line-height: 1.12;
            letter-spacing: -0.02em;
            max-width: min(100%, 18rem);
          }
          .tm-intel-heatmap-controls {
            width: 100%;
            justify-content: space-between;
            flex-wrap: wrap;
          }
          .tm-intel-heatmap-scroll {
            padding-bottom: 4px;
          }
          .tm-intel-heatmap-table {
            border-spacing: 3px !important;
            padding: 0 18px 18px !important;
            min-width: max-content;
          }
          .tm-intel-skill-th {
            min-width: 76px !important;
            height: auto !important;
          }
          .tm-intel-company-th,
          .tm-intel-company-td {
            position: sticky;
            left: 0;
            z-index: 2;
            background: var(--tm-surface);
          }
          .tm-intel-company-th { min-width: 124px !important; }
          .tm-intel-company-td {
            max-width: 124px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
      `}</style>
      <div className="tm-intel-page" style={{ padding: "32px 36px 64px", maxWidth: 1480, margin: "0 auto" }}>
        {/* The "live" signal now lives beside the Live link in the topbar — the
            toggle bar stands alone here (no indicator beside it). */}
        {/* Jobs | Heatmap tab switcher */}
        <div role="tablist" aria-label="Live Job Data view" style={{ display: "inline-flex", gap: 4, padding: 4, background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 999 }}>
          {TABS.map(t => {
            const on = activeTab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: "7px 20px", borderRadius: 999, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 600,
                  background: on ? "var(--tm-interactive)" : "transparent",
                  color: on ? "var(--tm-on-interactive, #fff)" : "var(--tm-text-muted)",
                  transition: "all 120ms ease",
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {activeTab === "jobs" ? (
          <MarketJobsTab
            token={token ?? ""}
            analytics={analytics}
            targetRoles={targetRoles}
            chipCountMap={chipCountMap}
            selectedCluster={selectedCluster}
            onSelectCluster={setSelectedCluster}
            targetLocations={profileData?.target_locations ?? []}
            followedNames={followedNames}
            onToggleFollow={following.toggle}
            canFollow={following.canFollow}
            disabledReason={following.disabledReason}
          />
        ) : (
          <div style={{ marginTop: 20 }}>
            {token && !cvReadyForPersonalization ? (
              <CVPrerequisiteCard readiness={cvReadiness} errorCode={profileData?.cv_upload_error_code ?? null} />
            ) : (
              <SkillHeatmap
                companies={followedCompanies}
                rowDataMap={rowDataMap}
                skills={heatmapSkills}
                skillLevels={skillLevels}
                selectedCell={selectedCell}
                onCellSelect={handleCellSelect}
                allSkills={skillDemandData?.skills ?? []}
                selectedSkillNames={selectedSkillNames}
                onToggleSkill={handleToggleSkill}
                isLoggedIn={!!token}
              />
            )}

            {resolvedCell && (
              <JobDrillPanel
                companyName={resolvedCell.companyName}
                skillName={resolvedCell.skillName}
                drillJobs={drillData?.jobs ?? []}
                isLoading={drillLoading}
                savedJobIds={savedJobIds}
                onSave={job => saveMutation.mutate(job.job_id)}
                onClose={() => setSelectedCell(null)}
                isLoggedIn={!!token}
              />
            )}
          </div>
        )}
      </div>
    </>
  )
}

export default function IntelPage() {
  return (
    <Suspense>
      <IntelPageInner />
    </Suspense>
  )
}
