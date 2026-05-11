"use client"

import { useState, useMemo, useCallback } from "react"
import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query"
import { jobs, users } from "@/lib/api"
import type { MarketAnalytics, NameCountItem, SkillCountItem, JobSearchItem } from "@/lib/api"
import { AppShell } from "@/components/app-shell"
import { useAuth } from "@/lib/hooks/use-auth"

// ── Deterministic helpers ────────────────────────────────────────────────────

function seededHash(s: string): number {
  return s.split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0) >>> 0
}

function genSparkline(seed: number): number[] {
  const base = (seed % 800) + 200
  return Array.from({ length: 14 }, (_, i) => {
    const noise = ((seed * (i + 1) * 137) % 100) / 100
    return Math.round(base * (0.7 + noise * 0.6))
  })
}

function fakeWeeklyDelta(name: string, count: number): { added: number; pct: number } {
  const h = seededHash(name)
  const added = Math.max(1, Math.round(count * (0.05 + (h % 17) * 0.004)))
  const pct = Math.round(((h % 230) * 0.09 + 0.5) * 10) / 10
  return { added, pct }
}

// ── Atoms ────────────────────────────────────────────────────────────────────

function Sparkline({ values, width = 300, height = 48 }: { values: number[]; width?: number; height?: number }) {
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)
  const pts = values.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
  const d = `M ${pts.join(" L ")}`
  const areaD = `${d} L ${width},${height} L 0,${height} Z`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="spk-fill-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--tm-accent)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--tm-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#spk-fill-grad)" />
      <path d={d} fill="none" stroke="var(--tm-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrendChip({ pct, up }: { pct: number; up: boolean }) {
  const color = up ? "var(--tm-success)" : "var(--tm-danger)"
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", color, fontFamily: "var(--tm-font-mono)", fontSize: 12, letterSpacing: "0.02em" }}>
      {up ? "▲" : "▼"} {pct.toFixed(1)}%
    </span>
  )
}

function FollowStarBtn({ isFollowed, onToggle }: { isFollowed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={isFollowed ? "Unfollow" : "Follow company"}
      style={{
        width: 28, height: 28, padding: 0, display: "inline-flex", alignItems: "center",
        justifyContent: "center", border: "none", background: "transparent",
        cursor: "pointer", color: isFollowed ? "var(--tm-warning)" : "var(--tm-text-faint)", flexShrink: 0,
      }}
    >
      <svg width={14} height={14} viewBox="0 0 16 16" fill={isFollowed ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3">
        <path d="M8 1.5l1.95 4.16 4.55.55-3.35 3.13.86 4.51L8 11.7l-4.01 2.15.86-4.51L1.5 6.21l4.55-.55L8 1.5z" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

// ── KPI pulse strip ──────────────────────────────────────────────────────────

function PulseStrip({ analytics, followedCount }: { analytics: MarketAnalytics; followedCount: number }) {
  const sparkValues = useMemo(() => genSparkline(analytics.total_jobs), [analytics.total_jobs])

  return (
    <div style={{
      background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
      borderRadius: "var(--tm-radius-lg)", display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 24, padding: "20px 24px", marginTop: 24,
    }}>
      <div>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>OPEN ROLES</div>
        <div style={{ fontSize: 32, fontWeight: 600, fontFamily: "var(--tm-font-mono)", color: "var(--tm-accent)", marginTop: 6, lineHeight: 1 }}>{analytics.total_jobs.toLocaleString()}</div>
        <div style={{ fontSize: 12, color: "var(--tm-text-muted)", marginTop: 4 }}>across {analytics.total_companies} companies</div>
      </div>
      <div>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>COMPANIES</div>
        <div style={{ fontSize: 32, fontWeight: 600, fontFamily: "var(--tm-font-mono)", color: "var(--tm-text)", marginTop: 6, lineHeight: 1 }}>{analytics.total_companies.toLocaleString()}</div>
        <div style={{ fontSize: 12, color: "var(--tm-text-muted)", marginTop: 4 }}>{followedCount} followed</div>
      </div>
      <div>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>TRACKED</div>
        <div style={{ fontSize: 32, fontWeight: 600, fontFamily: "var(--tm-font-mono)", color: "var(--tm-text)", marginTop: 6, lineHeight: 1 }}>{followedCount}</div>
        <div style={{ fontSize: 12, color: "var(--tm-text-muted)", marginTop: 4 }}>in Mission Control</div>
      </div>
      <div style={{ borderLeft: "1px solid var(--tm-border-soft)", paddingLeft: 24 }}>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>14-DAY POSTING</div>
        <div style={{ marginTop: 10 }}>
          <Sparkline values={sparkValues} width={260} height={48} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", marginTop: 4, letterSpacing: "0.06em" }}>
          <span>−13D</span><span>TODAY</span>
        </div>
      </div>
    </div>
  )
}

// ── Job drill-down panel ─────────────────────────────────────────────────────

function LocationBadge({ mode }: { mode: string | null | undefined }) {
  if (!mode || mode === "unknown") return null
  const labels: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }
  const colors: Record<string, string> = {
    remote: "rgba(0,245,212,0.12)",
    hybrid: "rgba(255,200,60,0.12)",
    onsite: "rgba(180,180,200,0.12)",
  }
  return (
    <span style={{
      fontSize: 10, fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em",
      padding: "2px 7px", borderRadius: 99, background: colors[mode] ?? "rgba(180,180,200,0.12)",
      color: "var(--tm-text-muted)", textTransform: "uppercase",
    }}>
      {labels[mode] ?? mode}
    </span>
  )
}

function JobDrillPanel({
  companyName,
  skillName,
  drillJobs,
  isLoading,
  savedJobIds,
  onSave,
  onClose,
  isLoggedIn,
}: {
  companyName: string
  skillName: string
  drillJobs: JobSearchItem[]
  isLoading: boolean
  savedJobIds: Set<string>
  onSave: (job: JobSearchItem) => void
  onClose: () => void
  isLoggedIn: boolean
}) {
  return (
    <div style={{
      background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
      borderRadius: "var(--tm-radius-lg)", marginTop: 4, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", borderBottom: "1px solid var(--tm-border-soft)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {companyName}
          </span>
          <span style={{ color: "var(--tm-text-faint)", fontSize: 11 }}>×</span>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {skillName}
          </span>
          {!isLoading && (
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, color: "var(--tm-text-faint)", marginLeft: 4 }}>
              · {drillJobs.length} jobs
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "1px solid var(--tm-border-soft)",
            borderRadius: "var(--tm-radius-sm)", padding: "4px 12px",
            color: "var(--tm-text-muted)", fontSize: 12, cursor: "pointer",
            fontFamily: "var(--tm-font-mono)",
          }}
        >
          ← Close
        </button>
      </div>

      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {isLoading ? (
          <div style={{ padding: "24px", color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", fontSize: 12 }}>
            Loading jobs...
          </div>
        ) : drillJobs.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", fontSize: 12 }}>
            No jobs found for this combination.
          </div>
        ) : (
          drillJobs.map((job, idx) => {
            const isSaved = savedJobIds.has(job.job_id)
            return (
              <div
                key={job.job_id}
                style={{
                  display: "flex", alignItems: "center", gap: 16, padding: "12px 24px",
                  borderBottom: idx < drillJobs.length - 1 ? "1px solid var(--tm-border-soft)" : "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {job.job_title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    {job.location_city && (
                      <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                        {job.location_city}{job.location_country ? `, ${job.location_country}` : ""}
                      </span>
                    )}
                    <LocationBadge mode={job.location_mode} />
                  </div>
                </div>
                {isLoggedIn && (
                  <button
                    onClick={() => onSave(job)}
                    disabled={isSaved}
                    style={{
                      flexShrink: 0, fontSize: 11, fontFamily: "var(--tm-font-mono)",
                      letterSpacing: "0.06em", padding: "5px 14px", borderRadius: "var(--tm-radius-sm)",
                      cursor: isSaved ? "default" : "pointer",
                      background: isSaved ? "rgba(0,245,212,0.08)" : "transparent",
                      border: `1px solid ${isSaved ? "var(--tm-accent)" : "var(--tm-border-soft)"}`,
                      color: isSaved ? "var(--tm-accent)" : "var(--tm-text-muted)",
                      transition: "all 150ms ease",
                    }}
                  >
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

// ── Skill × Company heatmap ──────────────────────────────────────────────────

function SkillHeatmap({
  companies,
  skillsMap,
  skills,
  skillLevels,
  followedNames,
  selectedCell,
  onCellSelect,
}: {
  companies: NameCountItem[]
  skillsMap: Record<string, SkillCountItem[]>
  skills: string[]
  skillLevels: Record<string, number>
  followedNames: string[]
  selectedCell: { ci: number; si: number } | null
  onCellSelect: (ci: number, si: number) => void
}) {
  const [hoverCell, setHoverCell] = useState<{ ci: number; si: number } | null>(null)

  const cellCount = useCallback((ci: number, si: number): number => {
    const co = companies[ci]
    const companySkills = skillsMap[co?.name] || []
    const targetSkill = skills[si]?.toLowerCase()
    return companySkills.find(s => s.skill.toLowerCase() === targetSkill)?.count ?? 0
  }, [companies, skillsMap, skills])

  const maxVal = useMemo(() => {
    const all = companies.flatMap((_, ci) => skills.map((_, si) => cellCount(ci, si)))
    return Math.max(...all, 1)
  }, [companies, skills, cellCount])

  if (!skills.length) return null

  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", marginTop: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "18px 24px 4px" }}>
        <div>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>
            YOUR SKILLS × COMPANY DEMAND
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2, color: "var(--tm-text)" }}>Where to invest your skill points</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "var(--tm-font-mono)", color: "var(--tm-text-faint)", letterSpacing: "0.06em", flexShrink: 0, paddingTop: 6 }}>
          LOW
          <div style={{ display: "flex", gap: 2 }}>
            {[0.1, 0.3, 0.5, 0.7, 0.95].map(o => (
              <div key={o} style={{ width: 14, height: 12, background: `rgba(0, 245, 212, ${o})`, borderRadius: 2 }} />
            ))}
          </div>
          HIGH
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 4, padding: "0 24px 24px", fontFamily: "var(--tm-font-mono)" }}>
          <thead>
            <tr>
              <th style={{ width: 180, minWidth: 140 }} />
              {skills.map(sk => {
                const level = skillLevels[sk.toLowerCase()] ?? 0
                return (
                  <th key={sk} style={{
                    writingMode: "vertical-rl", transform: "rotate(180deg)",
                    padding: "8px 0", fontSize: 11, color: "var(--tm-text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500,
                    textAlign: "left", height: 100, verticalAlign: "bottom",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <span style={{
                        fontSize: 9, color: level >= 3 ? "var(--tm-accent)" : level >= 1 ? "var(--tm-text-faint)" : "transparent",
                        fontWeight: 700,
                      }}>
                        L{level}
                      </span>
                      {sk}
                    </div>
                  </th>
                )
              })}
              <th style={{ padding: "0 8px", fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.08em", fontWeight: 500 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((co, ci) => {
              const rowSum = skills.reduce((s, _, si) => s + cellCount(ci, si), 0)
              const isFollowed = followedNames.includes(co.name)
              return (
                <tr key={co.name}>
                  <td style={{ paddingRight: 12, fontSize: 13, color: "var(--tm-text)", fontFamily: "var(--tm-font-sans)", fontWeight: 500, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {isFollowed && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--tm-warning)", flexShrink: 0 }} />}
                      {co.name}
                    </span>
                  </td>
                  {skills.map((_, si) => {
                    const v = cellCount(ci, si)
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
                          width: 36, height: 28, cursor: "pointer", textAlign: "center",
                          background: `rgba(0, 245, 212, ${0.06 + o * 0.85})`,
                          border: isSel ? "1px solid var(--tm-accent)" : isHover ? "1px solid var(--tm-accent-ring)" : "1px solid transparent",
                          borderRadius: 4, fontSize: 11,
                          color: o > 0.5 ? "var(--tm-bg)" : "var(--tm-text)",
                          fontWeight: 600,
                          transition: "background 150ms ease",
                        }}
                      >
                        {v || ""}
                      </td>
                    )
                  })}
                  <td style={{ padding: "0 8px", fontSize: 11, color: "var(--tm-text-muted)", fontWeight: 600 }}>{rowSum || ""}</td>
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

function TopMovers({ companies, followedNames, onToggleFollow }: {
  companies: NameCountItem[]
  followedNames: string[]
  onToggleFollow: (name: string) => void
}) {
  const movers = useMemo(
    () => companies.slice(0, 6).map(co => ({ ...co, ...fakeWeeklyDelta(co.name, co.count) })),
    [companies]
  )

  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", padding: "18px 20px" }}>
      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--tm-text-muted)", marginBottom: 4 }}>TOP MOVERS · 7D</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {movers.map((co, idx) => (
          <div
            key={co.name}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 0",
              borderBottom: idx < movers.length - 1 ? "1px solid var(--tm-border-soft)" : "none",
            }}
          >
            <div style={{ width: 28, fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", flexShrink: 0 }}>#{idx + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{co.name}</span>
                {followedNames.includes(co.name) && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--tm-warning)", flexShrink: 0 }} />}
              </div>
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 2 }}>{co.count.toLocaleString()} roles</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 14, color: "var(--tm-accent)", fontWeight: 600 }}>+{co.added}</div>
              <TrendChip pct={co.pct} up={true} />
            </div>
            <FollowStarBtn isFollowed={followedNames.includes(co.name)} onToggle={() => onToggleFollow(co.name)} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tracked digest ───────────────────────────────────────────────────────────

function TrackedDigest({ followedNames, analyticsByCompany, isLoggedIn }: {
  followedNames: string[]
  analyticsByCompany: Record<string, number>
  isLoggedIn: boolean
}) {
  const tracked = useMemo(
    () =>
      followedNames
        .map(name => ({ name, count: analyticsByCompany[name] ?? 0 }))
        .sort((a, b) => b.count - a.count),
    [followedNames, analyticsByCompany]
  )

  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", padding: "18px 20px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>
          TRACKED · {followedNames.length}
        </div>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-accent)", fontWeight: 600 }}>
          Sent to Mission Control
        </div>
      </div>

      {!isLoggedIn ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "28px 0", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)" }}>Sign in to track companies</div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Follow companies to surface them in Mission Control</div>
        </div>
      ) : followedNames.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "28px 0", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)" }}>No jobs tracked yet</div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.6 }}>
            Hit the ★ star next to any company<br />to send it to Mission Control
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {tracked.map((co, idx) => (
            <div
              key={co.name}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                padding: "10px 0",
                borderBottom: idx < tracked.length - 1 ? "1px solid var(--tm-border-soft)" : "none",
              }}
            >
              <div style={{ fontSize: 13, color: "var(--tm-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {co.name}
              </div>
              <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-accent)", flexShrink: 0 }}>
                {co.count} roles
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntelPage() {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  const [followedOnly, setFollowedOnly] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{ ci: number; si: number } | null>(null)
  const [manualSaved, setManualSaved] = useState<Set<string>>(new Set())

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["intel-analytics"],
    queryFn: () => jobs.analytics(),
    staleTime: 7 * 24 * 60 * 60 * 1000,
  })

  const { data: followedData } = useQuery({
    queryKey: ["followedCompanies", token],
    queryFn: () => users.followedCompanies(token!),
    enabled: !!token,
  })

  const { data: skillDemandData } = useQuery({
    queryKey: ["mySkillDemand", token],
    queryFn: () => jobs.mySkillDemand(token!),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
  })

  const followedNames = useMemo(
    () => followedData?.companies.map(c => c.company_name) ?? [],
    [followedData]
  )

  const topCompanies = useMemo(() => {
    let list = analytics?.by_company ?? []
    if (followedOnly) list = list.filter(c => followedNames.includes(c.name))
    return list.slice(0, 10)
  }, [analytics, followedOnly, followedNames])

  const skillQueries = useQueries({
    queries: topCompanies.map(co => ({
      queryKey: ["entitySkills", co.name],
      queryFn: () => jobs.analyticsEntitySkills(co.name, "company"),
      staleTime: 7 * 24 * 60 * 60 * 1000,
    })),
  })

  const skillsMap = useMemo(() => {
    const map: Record<string, SkillCountItem[]> = {}
    skillQueries.forEach((q, i) => {
      if (q.data && topCompanies[i]) map[topCompanies[i].name] = q.data.skills
    })
    return map
  }, [skillQueries, topCompanies])

  // User's own skills as heatmap columns; fall back to global aggregation for logged-out
  const heatmapSkills = useMemo(() => {
    if (skillDemandData?.skills?.length) {
      return skillDemandData.skills
        .filter(s => s.weighted_demand > 0)
        .sort((a, b) => b.weighted_demand - a.weighted_demand)
        .slice(0, 8)
        .map(s => s.display_name)
    }
    const freq: Record<string, number> = {}
    for (const skillList of Object.values(skillsMap)) {
      for (const s of skillList) freq[s.skill] = (freq[s.skill] || 0) + s.count
    }
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([sk]) => sk)
  }, [skillDemandData, skillsMap])

  // skill display_name → current_level map for column header pips
  const skillLevels = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of skillDemandData?.skills ?? []) {
      map[s.display_name.toLowerCase()] = s.current_level
    }
    return map
  }, [skillDemandData])

  // Resolved cell info for drill-down
  const resolvedCell = useMemo(() => {
    if (!selectedCell) return null
    const company = topCompanies[selectedCell.ci]
    const skill = heatmapSkills[selectedCell.si]
    if (!company || !skill) return null
    return { companyName: company.name, skillName: skill }
  }, [selectedCell, topCompanies, heatmapSkills])

  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ["cellJobs", resolvedCell?.companyName, resolvedCell?.skillName],
    queryFn: () => jobs.search(resolvedCell!.companyName, { skill: resolvedCell!.skillName, pageSize: 50 }),
    enabled: !!resolvedCell,
    staleTime: 10 * 60 * 1000,
  })

  const drillJobs = drillData?.jobs ?? []

  const saveMutation = useMutation({
    mutationFn: (jobId: string) => jobs.saveJob(token!, jobId),
    onSuccess: (_data, jobId) => {
      setManualSaved(prev => new Set(Array.from(prev).concat(jobId)))
      queryClient.invalidateQueries({ queryKey: ["applications"] })
    },
  })

  const savedJobIds = useMemo(() => new Set(Array.from(manualSaved)), [manualSaved])

  const analyticsByCompany = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of analytics?.by_company ?? []) m[c.name] = c.count
    return m
  }, [analytics])

  const followMutation = useMutation({
    mutationFn: async ({ name, follow }: { name: string; follow: boolean }) => {
      if (follow) await users.followCompany(token!, name)
      else await users.unfollowCompany(token!, name)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["followedCompanies"] }),
  })

  const handleToggleFollow = useCallback(
    (name: string) => {
      if (!token) return
      followMutation.mutate({ name, follow: !followedNames.includes(name) })
    },
    [token, followedNames, followMutation]
  )

  const handleCellSelect = useCallback((ci: number, si: number) => {
    setSelectedCell(prev => (prev?.ci === ci && prev?.si === si ? null : { ci, si }))
  }, [])

  const moversCompanies = useMemo(() => {
    let list = analytics?.by_company ?? []
    if (followedOnly) list = list.filter(c => followedNames.includes(c.name))
    return list.slice(0, 6)
  }, [analytics, followedOnly, followedNames])

  return (
    <AppShell>
      <div style={{ padding: "32px 36px 64px", maxWidth: 1480, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 4 }}>
              CAREER INTELLIGENCE
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--tm-text)", letterSpacing: "-0.01em" }}>Intel</h1>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" as const }}>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: followedOnly ? "var(--tm-accent)" : "var(--tm-text-muted)" }}>
              Followed only
            </span>
            <div
              onClick={() => setFollowedOnly(f => !f)}
              style={{
                width: 36, height: 20, borderRadius: 99, position: "relative",
                background: followedOnly ? "var(--tm-accent)" : "var(--tm-border)",
                cursor: "pointer", transition: "background 200ms ease", flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute", top: 3, left: followedOnly ? 19 : 3,
                width: 14, height: 14, borderRadius: "50%",
                background: followedOnly ? "var(--tm-bg)" : "var(--tm-text-faint)",
                transition: "left 200ms ease",
              }} />
            </div>
          </label>
        </div>

        {analyticsLoading || !analytics ? (
          <div style={{ marginTop: 48, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", fontSize: 13 }}>
            Loading market data...
          </div>
        ) : (
          <>
            <PulseStrip analytics={analytics} followedCount={followedNames.length} />
            <SkillHeatmap
              companies={topCompanies}
              skillsMap={skillsMap}
              skills={heatmapSkills}
              skillLevels={skillLevels}
              followedNames={followedNames}
              selectedCell={selectedCell}
              onCellSelect={handleCellSelect}
            />
            {resolvedCell && (
              <JobDrillPanel
                companyName={resolvedCell.companyName}
                skillName={resolvedCell.skillName}
                drillJobs={drillJobs}
                isLoading={drillLoading}
                savedJobIds={savedJobIds}
                onSave={job => saveMutation.mutate(job.job_id)}
                onClose={() => setSelectedCell(null)}
                isLoggedIn={!!token}
              />
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14, marginTop: 14 }}>
              <TopMovers companies={moversCompanies} followedNames={followedNames} onToggleFollow={handleToggleFollow} />
              <TrackedDigest followedNames={followedNames} analyticsByCompany={analyticsByCompany} isLoggedIn={!!token} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
