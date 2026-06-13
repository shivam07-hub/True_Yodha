/**
 * Shared atoms for the CV Library Atelier layout.
 * Stage meta, CompanyAvatar, FitBar, StatusDot.
 */
"use client"

import type { ApplicationStatus } from "@/lib/api"

// ── Company color palette (fixed — hash mod 6) ────────────────────
const COMPANY_COLORS = ["#3DBEFF", "#1F8FE0", "#FF5A5F", "#7B41B1", "#0696D7", "#A100FF"]

export function companyColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COMPANY_COLORS[h % COMPANY_COLORS.length]
}

export function companyInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

// ── Stage meta ────────────────────────────────────────────────────
export const STAGE_META: Record<ApplicationStatus, { label: string; color: string }> = {
  saved:        { label: "Saved",        color: "var(--tm-text-muted)" },
  applied:      { label: "Applied",      color: "var(--tm-info)" },
  screening:    { label: "Screening",    color: "var(--tm-warning)" },
  interviewing: { label: "Interviewing", color: "var(--tm-interactive)" },
  final_round:  { label: "Final Round",  color: "var(--tm-interactive)" },
  offer:        { label: "Offer",        color: "var(--tm-success)" },
  ghosted:      { label: "Ghosted",      color: "var(--tm-text-faint)" },
  rejected:     { label: "Rejected",     color: "var(--tm-danger)" },
  withdrew:     { label: "Withdrew",     color: "var(--tm-text-faint)" },
}

export const STAGE_RANK: ApplicationStatus[] = ["saved", "applied", "screening", "interviewing", "final_round", "offer", "ghosted", "rejected", "withdrew"]

export function stageRank(s: ApplicationStatus): number { return STAGE_RANK.indexOf(s) }

// ── CompanyAvatar ─────────────────────────────────────────────────
export function CompanyAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const color = companyColor(name)
  const initials = companyInitials(name)
  return (
    <div
      className="tm-lib-company-avatar"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${color}38, ${color}18)`,
        border: `1px solid ${color}55`,
        fontSize: size <= 24 ? 10 : 12,
        color,
      }}
    >
      {initials}
    </div>
  )
}

// ── StatusDot ─────────────────────────────────────────────────────
export function StatusDot({ stage }: { stage: ApplicationStatus }) {
  const m = STAGE_META[stage] ?? STAGE_META.saved
  const glow = (stage === "interviewing" || stage === "final_round")
    ? `0 0 6px ${m.color}` : "none"
  return (
    <span
      className="tm-lib-stage-dot"
      style={{ background: m.color, boxShadow: glow }}
    />
  )
}

// ── FitBar ────────────────────────────────────────────────────────
export function FitBar({ fit }: { fit: number }) {
  const color = fit >= 80 ? "var(--tm-success)" : fit >= 65 ? "var(--tm-interactive)" : "var(--tm-warning)"
  return (
    <div className="tm-lib-fit-bar-wrap">
      <div className="tm-lib-fit-track">
        <div className="tm-lib-fit-fill" style={{ width: `${fit}%`, background: color }} />
      </div>
      <span className="tm-lib-fit-num" style={{ color }}>{fit}</span>
    </div>
  )
}

// ── StatTile ──────────────────────────────────────────────────────
export function StatTile({ eyebrow, value, sub }: {
  eyebrow: string; value: string | number; sub: string
}) {
  return (
    <div className="tm-lib-stat-tile">
      <div className="tm-lib-eyebrow">{eyebrow}</div>
      <div className="tm-lib-stat-num tm-lib-mono">{value}</div>
      <div className="tm-lib-stat-sub">{sub}</div>
    </div>
  )
}

// ── Pill ──────────────────────────────────────────────────────────
export function Pill({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`tm-lib-pill${accent ? " accent" : ""}`}>{children}</span>
  )
}

// ── Tiny Aperture SVG ────────────────────────────────────────────
export function ApertureMark({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--tm-text-faint)" }}>
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="4"/>
      <path d="M14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83M16.62 12l-5.74 9.94"/>
    </svg>
  )
}

// ── Format helpers ────────────────────────────────────────────────
export function timeAgoShort(iso: string | null | undefined): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86400000)
  if (days < 1) return "today"
  if (days === 1) return "1d"
  return `${days}d`
}
