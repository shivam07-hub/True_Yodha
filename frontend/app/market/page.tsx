"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query"
import { jobs, users, xp } from "@/lib/api"
import { IntelLoadingState } from "@/components/market/intel-loading-state"
import { MARKET_LOADING_STEPS } from "@/lib/market-loading-copy"
import type { MarketAnalytics, NameCountItem, JobSearchItem, UserSkillDemandItem, FollowedCompany, FollowedCompaniesResponse, JobLocationFilters } from "@/lib/api"
import { AppShell } from "@/components/app-shell"
import { useAuth } from "@/lib/hooks/use-auth"
import { useXPStore } from "@/store/xpStore"

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_HEATMAP_SKILLS = 8
const MAX_FOLLOWED = 10
const XP_FLOOR = -30
const FOLLOW_XP_COST = 10

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function FollowStarBtn({
  isFollowed,
  onToggle,
  onHover,
  disabled,
  disabledReason,
}: {
  isFollowed: boolean
  onToggle: () => void
  onHover?: () => void
  disabled?: boolean
  disabledReason?: string
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle() }}
      onMouseEnter={onHover}
      title={disabled ? disabledReason : isFollowed ? "Unfollow" : `Follow · ${FOLLOW_XP_COST} XP`}
      style={{
        width: 44, height: 28, padding: "0 6px", display: "inline-flex", alignItems: "center",
        justifyContent: "center", gap: 3, border: "none", background: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        color: isFollowed ? "var(--tm-warning)" : disabled ? "var(--tm-text-faint)" : "var(--tm-text-faint)",
        opacity: disabled && !isFollowed ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      <svg width={13} height={13} viewBox="0 0 16 16" fill={isFollowed ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3">
        <path d="M8 1.5l1.95 4.16 4.55.55-3.35 3.13.86 4.51L8 11.7l-4.01 2.15.86-4.51L1.5 6.21l4.55-.55L8 1.5z" strokeLinejoin="round" />
      </svg>
      {!isFollowed && !disabled && (
        <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 9, color: "var(--tm-text-faint)", letterSpacing: "0.04em" }}>
          {FOLLOW_XP_COST}
        </span>
      )}
    </button>
  )
}

// ── Progress banner ──────────────────────────────────────────────────────────

function ProgressBanner({
  analyticsReady,
  skillsReady,
  heatmapReady,
  message,
}: {
  analyticsReady: boolean
  skillsReady: boolean
  heatmapReady: boolean
  message: string
}) {
  const steps = [
    { label: "Loading market data", done: analyticsReady },
    { label: "Mapping your skills", done: skillsReady },
    { label: "Building heatmap", done: heatmapReady },
  ]
  const allDone = steps.every(s => s.done)
  if (allDone) return null

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16, padding: "10px 16px",
      background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
      borderRadius: "var(--tm-radius-lg)", marginTop: 16,
    }}>
      <IntelLoadingState message={message} />
      <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
        {steps.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: s.done ? "var(--tm-accent)" : "var(--tm-border)",
              transition: "background 300ms ease",
            }} />
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, color: s.done ? "var(--tm-accent)" : "var(--tm-text-faint)", letterSpacing: "0.06em" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
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
  companyName, skillName, drillJobs, isLoading, savedJobIds, onSave, onClose, isLoggedIn,
}: {
  companyName: string; skillName: string; drillJobs: JobSearchItem[]; isLoading: boolean
  savedJobIds: Set<string>; onSave: (job: JobSearchItem) => void; onClose: () => void; isLoggedIn: boolean
}) {
  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", marginTop: 4, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid var(--tm-border-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{companyName}</span>
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
                  <button onClick={() => onSave(job)} disabled={isSaved} style={{ flexShrink: 0, fontSize: 11, fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em", padding: "5px 14px", borderRadius: "var(--tm-radius-sm)", cursor: isSaved ? "default" : "pointer", background: isSaved ? "rgba(0,245,212,0.08)" : "transparent", border: `1px solid ${isSaved ? "var(--tm-accent)" : "var(--tm-border-soft)"}`, color: isSaved ? "var(--tm-accent)" : "var(--tm-text-muted)", transition: "all 150ms ease" }}>
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
          Star companies from the list below to add them here.
          Each follow costs {FOLLOW_XP_COST} XP — up to {MAX_FOLLOWED} companies.
        </div>
      </div>
    )
  }

  if (!skills.length) return null

  const unselectedSkills = allSkills.filter(s => !selectedSkillNames.has(s.display_name))
  const selectedCount = selectedSkillNames.size

  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", marginTop: 14, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "18px 24px 4px" }}>
        <div>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>YOUR SKILLS × COMPANY DEMAND</div>
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

      {/* Integrated Skill Lens — active columns + available skills to add */}
      {isLoggedIn && allSkills.length > 0 && (
        <div style={{ padding: "10px 24px 12px", borderBottom: "1px solid var(--tm-border-soft)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", flexShrink: 0 }}>LENS</span>
          {/* Active (selected) skill chips */}
          {skills.map(sk => (
            <button
              key={sk}
              onClick={() => { if (selectedCount > 1) onToggleSkill(sk) }}
              title={selectedCount <= 1 ? "Must keep at least one skill" : `Remove ${sk} from columns`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px",
                borderRadius: 999, cursor: selectedCount > 1 ? "pointer" : "default",
                background: "rgba(0,245,212,0.10)", border: "1px solid var(--tm-accent)",
                color: "var(--tm-accent)", fontFamily: "var(--tm-font-mono)", fontSize: 10,
                letterSpacing: "0.04em", transition: "all 100ms ease",
              }}
            >
              {sk}
              {selectedCount > 1 && <span style={{ fontSize: 9, opacity: 0.6 }}>×</span>}
            </button>
          ))}
          {/* Separator */}
          {unselectedSkills.length > 0 && (
            <span style={{ width: 1, height: 16, background: "var(--tm-border-soft)", flexShrink: 0 }} />
          )}
          {/* Inactive (unselected) skills — greyed out, click to add */}
          {unselectedSkills.map(s => (
            <button
              key={s.display_name}
              onClick={() => onToggleSkill(s.display_name)}
              title={`Add ${s.display_name} as column`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px",
                borderRadius: 999, cursor: "pointer",
                background: "transparent", border: "1px solid var(--tm-border-soft)",
                color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", fontSize: 10,
                letterSpacing: "0.04em", opacity: 0.7, transition: "all 100ms ease",
              }}
            >
              <span style={{ fontSize: 9 }}>+</span>{s.display_name}
            </button>
          ))}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 4, padding: "0 24px 24px", fontFamily: "var(--tm-font-mono)" }}>
          <thead>
            <tr>
              <th style={{ width: 180, minWidth: 140 }} />
              {skills.map(sk => {
                const level = skillLevels[sk.toLowerCase()] ?? 0
                return (
                  <th key={sk} style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", padding: "8px 0", fontSize: 11, color: "var(--tm-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500, textAlign: "left", height: 100, verticalAlign: "bottom" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 9, color: level >= 3 ? "var(--tm-accent)" : level >= 1 ? "var(--tm-text-faint)" : "transparent", fontWeight: 700 }}>L{level}</span>
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
              const rowData = rowDataMap[co.company_name]
              const isLoading = rowData === null
              const rowSum = rowData ? skills.reduce((s, sk) => s + (rowData[sk] ?? 0), 0) : null
              const isEmpty = !isLoading && rowSum === 0
              return (
                <tr key={co.company_name} style={{ opacity: isEmpty ? 0.5 : 1 }}>
                  <td style={{ paddingRight: 12, fontSize: 13, color: "var(--tm-text)", fontFamily: "var(--tm-font-sans)", fontWeight: 500, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--tm-warning)", flexShrink: 0 }} />
                      <Link href={`/companies/${encodeURIComponent(co.company_name)}`} style={{ color: "inherit", textDecoration: "none" }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-accent)" }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-text)" }}>
                        {co.company_name}
                      </Link>
                    </span>
                  </td>
                  {isLoading ? (
                    skills.map((_, si) => <ShimmerCell key={si} />)
                  ) : isEmpty ? (
                    <td colSpan={skills.length} style={{ paddingLeft: 8, fontSize: 11, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em" }}>
                      no roles match selected skills
                    </td>
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
                            width: 36, height: 28, cursor: "pointer", textAlign: "center",
                            background: `rgba(0, 245, 212, ${0.06 + o * 0.85})`,
                            border: isSel ? "1px solid var(--tm-accent)" : isHover ? "1px solid var(--tm-accent-ring)" : "1px solid transparent",
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

function TopMovers({ companies, followedNames, onToggleFollow, onHoverStar, xpBalance, followedCount }: {
  companies: NameCountItem[]
  followedNames: string[]
  onToggleFollow: (name: string) => void
  onHoverStar: (name: string) => void
  xpBalance: number
  followedCount: number
}) {
  const [search, setSearch] = useState("")

  const movers = useMemo(
    () => companies.map(co => ({ ...co, ...fakeWeeklyDelta(co.name, co.count) })),
    [companies]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? movers.filter(co => co.name.toLowerCase().includes(q)) : movers
  }, [movers, search])

  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", padding: "18px 20px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>
          TOP MOVERS · 7D
          <span style={{ marginLeft: 8, color: "var(--tm-text-faint)", fontWeight: 400 }}>{filtered.length}</span>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)", padding: "4px 10px", fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text)", outline: "none", width: 120 }}
        />
      </div>
      <div style={{ overflowY: "auto", maxHeight: 400 }}>
        {filtered.map((co, idx) => {
          const isFollowed = followedNames.includes(co.name)
          const atCap = !isFollowed && followedCount >= MAX_FOLLOWED
          const atFloor = !isFollowed && xpBalance - FOLLOW_XP_COST < XP_FLOOR
          const disabled = atCap || atFloor
          const disabledReason = atCap ? `Limit: ${MAX_FOLLOWED} companies` : `XP floor (${XP_FLOOR}) would be breached`
          return (
            <div key={co.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: idx < filtered.length - 1 ? "1px solid var(--tm-border-soft)" : "none" }}>
              <div style={{ width: 28, fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)", flexShrink: 0 }}>#{idx + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Link href={`/companies/${encodeURIComponent(co.name)}`} style={{ color: "inherit", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-accent)" }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-text)" }}>
                    {co.name}
                  </Link>
                  {isFollowed && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--tm-warning)", flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 2 }}>{co.count.toLocaleString()} roles</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 14, color: "var(--tm-accent)", fontWeight: 600 }}>+{co.added}</div>
                <TrendChip pct={co.pct} up={true} />
              </div>
              <FollowStarBtn
                isFollowed={isFollowed}
                onToggle={() => onToggleFollow(co.name)}
                onHover={() => !isFollowed && onHoverStar(co.name)}
                disabled={disabled}
                disabledReason={disabledReason}
              />
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)" }}>No match</div>
        )}
      </div>
    </div>
  )
}

// ── Filters ──────────────────────────────────────────────────────────────────

const LOCATION_SELECT_STYLE = {
  background: "var(--tm-surface)",
  border: "1px solid var(--tm-border-soft)",
  borderRadius: "var(--tm-radius-sm)",
  padding: "6px 32px 6px 12px",
  fontFamily: "var(--tm-font-sans)",
  fontSize: 13,
  color: "var(--tm-text)",
  cursor: "pointer",
  outline: "none",
  appearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
}

function TargetRoleBar({ targetRoles, chipCountMap, selectedCluster, onSelect, isLoggedIn }: {
  targetRoles: string[]
  chipCountMap: Record<string, number>
  selectedCluster: string | null
  onSelect: (cluster: string) => void
  isLoggedIn: boolean
}) {
  const [hoveredRole, setHoveredRole] = useState<string | null>(null)

  if (!isLoggedIn) return null

  const isEmpty = targetRoles.length === 0

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-muted)", flexShrink: 0 }}>TARGET</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {isEmpty ? (
          <button
            onClick={() => document.dispatchEvent(new CustomEvent("tm:open-settings"))}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px",
              borderRadius: 999, cursor: "pointer",
              background: "transparent",
              border: "1px dashed var(--tm-border-soft)",
              color: "var(--tm-text-faint)",
              fontFamily: "var(--tm-font-sans)", fontSize: 13, transition: "all 120ms ease",
            }}
          >
            + Add target roles →
          </button>
        ) : (
          targetRoles.map(role => {
            const selected = selectedCluster === role
            const hovered = hoveredRole === role && !selected
            const count = chipCountMap[role]
            return (
              <button
                key={role}
                onClick={() => onSelect(role)}
                onMouseEnter={() => setHoveredRole(role)}
                onMouseLeave={() => setHoveredRole(null)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px",
                  borderRadius: 999, cursor: "pointer",
                  background: selected ? "rgba(0,245,212,0.08)" : hovered ? "rgba(255,255,255,0.04)" : "transparent",
                  border: `1px solid ${selected ? "var(--tm-accent)" : hovered ? "rgba(255,255,255,0.18)" : "var(--tm-border-soft)"}`,
                  color: selected ? "var(--tm-accent)" : hovered ? "var(--tm-text)" : "var(--tm-text-muted)",
                  fontFamily: "var(--tm-font-sans)", fontSize: 13, transition: "all 120ms ease",
                }}
              >
                {role}
                {count != null && (
                  <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: selected ? "rgba(0,245,212,0.6)" : "var(--tm-text-faint)", fontWeight: 600 }}>
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function LocationBar({ cities, countries, city, country, mode, onCity, onCountry, onMode }: {
  cities: NameCountItem[]
  countries: NameCountItem[]
  city: string
  country: string
  mode: string
  onCity: (v: string) => void
  onCountry: (v: string) => void
  onMode: (v: string) => void
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-muted)", flexShrink: 0 }}>LOCATION</span>
      <select value={city} onChange={e => onCity(e.target.value)} style={{ ...LOCATION_SELECT_STYLE, minWidth: 140 }}>
        <option value="">All cities</option>
        {cities.slice(0, 40).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>
      <select value={country} onChange={e => onCountry(e.target.value)} style={{ ...LOCATION_SELECT_STYLE, minWidth: 160 }}>
        <option value="">All countries</option>
        {countries.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>
      <select value={mode} onChange={e => onMode(e.target.value)} style={{ ...LOCATION_SELECT_STYLE, minWidth: 130 }}>
        <option value="">All modes</option>
        <option value="remote">Remote</option>
        <option value="hybrid">Hybrid</option>
        <option value="onsite">On-site</option>
      </select>
    </div>
  )
}

// ── Skill Selector Panel ─────────────────────────────────────────────────────

function SkillSelectorPanel({
  skills, selectedNames, onToggle, isLoggedIn,
}: {
  skills: UserSkillDemandItem[]
  selectedNames: Set<string>
  onToggle: (name: string) => void
  isLoggedIn: boolean
}) {
  const selectedCount = selectedNames.size
  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", padding: "18px 20px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
        <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--tm-text-muted)" }}>SKILL LENS</div>
        {isLoggedIn && skills.length > 0 && (
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.08em", color: selectedCount >= MAX_HEATMAP_SKILLS ? "var(--tm-warning)" : "var(--tm-accent)", fontWeight: 600 }}>
            {selectedCount}/{MAX_HEATMAP_SKILLS}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginBottom: 14, lineHeight: 1.5 }}>
        {isLoggedIn ? "Toggle which of your CV skills appear as heatmap columns" : "Sign in to personalise the heatmap"}
      </div>
      {!isLoggedIn ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "28px 0", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)" }}>Sign in to use Skill Lens</div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Heatmap shows your CV skills when logged in</div>
        </div>
      ) : skills.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "28px 0", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)" }}>No skills detected</div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Upload your CV to populate the heatmap with your skills</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, overflowY: "auto", maxHeight: 260 }}>
          {skills.map(skill => {
            const selected = selectedNames.has(skill.display_name)
            const atMax = !selected && selectedCount >= MAX_HEATMAP_SKILLS
            return (
              <button
                key={skill.display_name}
                onClick={() => !atMax && onToggle(skill.display_name)}
                title={atMax ? "Max 8 selected — deselect one first" : `${skill.display_name} · ${skill.job_count_30d} jobs (30d)`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 99,
                  cursor: atMax ? "not-allowed" : "pointer",
                  background: selected ? "rgba(0,245,212,0.10)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selected ? "var(--tm-accent)" : "var(--tm-border-soft)"}`,
                  color: selected ? "var(--tm-accent)" : atMax ? "var(--tm-text-faint)" : "var(--tm-text-muted)",
                  fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.04em",
                  opacity: atMax ? 0.45 : 1, transition: "all 120ms ease", flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: selected ? "rgba(0,245,212,0.7)" : skill.current_level >= 3 ? "var(--tm-text-muted)" : "var(--tm-text-faint)" }}>L{skill.current_level}</span>
                {skill.display_name}
                {skill.job_count_30d > 0 && <span style={{ fontSize: 9, color: selected ? "rgba(0,245,212,0.5)" : "var(--tm-text-faint)", marginLeft: 1 }}>{skill.job_count_30d}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntelPage() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const { balance: xpBalance, setBalance: setXPBalance } = useXPStore()
  const searchParams = useSearchParams()
  const paramSkill = searchParams.get("skill")

  const [selectedCell, setSelectedCell] = useState<{ ci: number; si: number } | null>(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const [manualSaved, setManualSaved] = useState<Set<string>>(new Set())
  const [selectedSkillNames, setSelectedSkillNames] = useState<Set<string>>(new Set())
  const [skillsInitialized, setSkillsInitialized] = useState(false)
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [locationCity, setLocationCity] = useState("")
  const [locationCountry, setLocationCountry] = useState("")
  const [locationMode, setLocationMode] = useState("")

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
  const targetRoles: string[] = profileData?.target_roles ?? []

  const locFilters = {
    locationCity: locationCity || null,
    locationCountry: locationCountry || null,
    locationMode: (locationMode || null) as JobLocationFilters["locationMode"],
  }

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
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

  useEffect(() => {
    if (!analyticsLoading && analytics) return
    const id = setInterval(() => setLoadingStep(s => (s + 1) % MARKET_LOADING_STEPS.length), 1500)
    return () => clearInterval(id)
  }, [analyticsLoading, analytics])

  const { data: followedData } = useQuery({
    queryKey: ["followedCompanies", token],
    queryFn: () => users.followedCompanies(token!),
    enabled: !!token,
  })

  const { data: skillDemandData, isLoading: skillDemandLoading } = useQuery({
    queryKey: ["mySkillDemand", token],
    queryFn: () => jobs.mySkillDemand(token!),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
  })

  // followedCompanies sorted most-recently-starred first (already DESC from backend)
  const followedCompanies = useMemo<FollowedCompany[]>(
    () => followedData?.companies ?? [],
    [followedData]
  )

  const followedNames = useMemo(
    () => followedCompanies.map(c => c.company_name),
    [followedCompanies]
  )

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
  }, [selectedSkillNames, skillDemandData, paramSkill])

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

  const allRowsLoaded = heatmapRowQueries.length > 0 && heatmapRowQueries.every(q => !q.isLoading)

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

  const followMutation = useMutation({
    mutationFn: async ({ name, follow }: { name: string; follow: boolean }) => {
      if (follow) return users.followCompany(token!, name)
      await users.unfollowCompany(token!, name)
      return null
    },
    onMutate: async ({ name, follow }) => {
      await queryClient.cancelQueries({ queryKey: ["followedCompanies", token] })
      const previous = queryClient.getQueryData<FollowedCompaniesResponse>(["followedCompanies", token])
      queryClient.setQueryData<FollowedCompaniesResponse>(["followedCompanies", token], old => {
        if (!old) return old
        const companies = follow
          ? [{ company_name: name, created_at: new Date().toISOString() }, ...old.companies]
          : old.companies.filter(c => c.company_name !== name)
        return { companies, total: companies.length }
      })
      return { previous }
    },
    onSuccess: (data) => {
      if (data && typeof data.new_xp_balance === "number") {
        setXPBalance(data.new_xp_balance)
      }
      queryClient.invalidateQueries({ queryKey: ["followedCompanies"] })
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["followedCompanies", token], context.previous)
      }
    },
  })

  const handleToggleFollow = useCallback(
    (name: string) => {
      if (!token) return
      followMutation.mutate({ name, follow: !followedNames.includes(name) })
    },
    [token, followedNames, followMutation]
  )

  const handleHoverStar = useCallback(
    (company: string) => {
      if (heatmapSkills.length === 0) return
      void queryClient.prefetchQuery({
        queryKey: ["heatmapRow", company, heatmapSkills.join(","), locationCity, locationCountry, locationMode],
        queryFn: () => jobs.skillHeatmapRow(company, heatmapSkills, locFilters),
        staleTime: 30 * 60 * 1000,
      })
    },
    [queryClient, heatmapSkills, locationCity, locationCountry, locationMode, locFilters]
  )

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

  const savedJobIds = useMemo(() => new Set(Array.from(manualSaved)), [manualSaved])

  const moversCompanies = useMemo(() => analytics?.by_company ?? [], [analytics])

  return (
    <AppShell>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      <div style={{ padding: "32px 36px 64px", maxWidth: 1480, margin: "0 auto" }}>
        <div>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 4 }}>CAREER INTELLIGENCE</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--tm-text)", letterSpacing: "-0.01em" }}>Intel</h1>
          {analytics && (
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-accent)", marginTop: 6, letterSpacing: "0.06em" }}>
              {analytics.total_jobs.toLocaleString()} JOBS · {analytics.total_companies.toLocaleString()} COMPANIES · {analytics.total_industries.toLocaleString()} INDUSTRY GROUPS
            </div>
          )}
        </div>

        <TargetRoleBar
          targetRoles={targetRoles}
          chipCountMap={chipCountMap}
          selectedCluster={selectedCluster}
          onSelect={cluster => setSelectedCluster(prev => prev === cluster ? null : cluster)}
          isLoggedIn={!!token}
        />

        <LocationBar
          cities={analytics?.by_location_city ?? []}
          countries={analytics?.by_location_country ?? []}
          city={locationCity}
          country={locationCountry}
          mode={locationMode}
          onCity={setLocationCity}
          onCountry={setLocationCountry}
          onMode={setLocationMode}
        />

        {/* Progress banner — visible only during initial load, never blocks content */}
        <ProgressBanner
          analyticsReady={!analyticsLoading && !!analytics}
          skillsReady={!skillDemandLoading && !!skillDemandData}
          heatmapReady={allRowsLoaded}
          message={MARKET_LOADING_STEPS[loadingStep]}
        />

        {analytics && <PulseStrip analytics={analytics} followedCount={followedNames.length} />}

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

        <div style={{ marginTop: 14 }}>
          <TopMovers
            companies={moversCompanies}
            followedNames={followedNames}
            onToggleFollow={handleToggleFollow}
            onHoverStar={handleHoverStar}
            xpBalance={xpBalance}
            followedCount={followedCompanies.length}
          />
        </div>
      </div>
    </AppShell>
  )
}
