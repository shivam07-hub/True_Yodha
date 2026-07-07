import type { JobFeedItem, JobMatch } from "@/lib/api"
import { formatJobLocation } from "@/lib/format-location"

/* ══════════════════════════════════════════════════════════════════════════
   job-model — normalises a real JobFeedItem (Jobs feed) or JobMatch
   (Collections, via synthMatch) into the row shape the handoff cards render.
   Keeps the design's colour/verdict/grade/chip logic in ONE place so Jobs and
   Collections stay pixel-identical. Ring geometry (dashoffset) is computed at
   the call-site since the circle radius differs per surface.
   ══════════════════════════════════════════════════════════════════════════ */

export interface JobChip {
  name: string
  sym: "✓" | "✕"
  bg: string
  fg: string
}

export interface MobileJobRow {
  id: string
  co: string
  coInitial: string
  logoBg: string
  role: string
  ago: string
  metaLine: string
  grade: string
  hasGrade: boolean
  gradeFg: string
  gradeBd: string
  checkDetails: boolean
  fit: number
  ringColor: string
  verdict: string
  chips: JobChip[]
  hasExtra: boolean
  extra: string
  move: string
  moveFg: string
  verified: string
  sourceUrl: string | null
}

export function logoBg(co: string): string {
  let h = 0
  for (let i = 0; i < co.length; i++) h = (h * 31 + co.charCodeAt(i)) % 360
  return `hsl(${h} 32% 40%)`
}

export function ringColor(fit: number): string {
  if (fit >= 70) return "#4ade80"
  if (fit >= 40) return "#f59e0b"
  return "#fb7185"
}

/** Prefer the server-derived verdict word; fall back to the score band. */
function verdictWord(fit: number, verdict?: string | null): string {
  switch (verdict) {
    case "strong":
    case "worth_it":
      return "Worth it"
    case "stretch":
      return "Stretch"
    case "checking":
      return "Checking"
  }
  if (fit >= 70) return "Worth it"
  if (fit >= 40) return "Stretch"
  return "Long shot"
}

/** Compact age token — "4d", "2w", "1mo", "1y" (matches the handoff). */
export function compactAge(iso?: string | null): string {
  if (!iso) return ""
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ""
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000))
  if (days <= 0) return "today"
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

interface RowInput {
  id: string
  co: string
  role: string
  location: string | null
  mode: string | null
  ago: string
  fit: number
  verdict?: string | null
  grade?: string | null
  legitimacyTier?: string | null
  isStale?: boolean
  matched: string[]
  gaps: string[]
  sourceUrl: string | null
  verified: string
  move: string
}

function buildRow(j: RowInput): MobileJobRow {
  const chips: JobChip[] = [
    ...j.matched.map<JobChip>(n => ({ name: n, sym: "✓", bg: "rgba(74,222,128,0.09)", fg: "#6fe39c" })),
    ...j.gaps.map<JobChip>(n => ({ name: n, sym: "✕", bg: "rgba(255,255,255,0.05)", fg: "#a6a69e" })),
  ]
  const shown = chips.slice(0, 3)
  const extra = chips.length - shown.length
  const grade = (j.grade ?? "").trim()
  const isC = grade.startsWith("C") || grade.startsWith("D")
  const checkDetails =
    j.legitimacyTier === "caution" || j.legitimacyTier === "suspicious" || !!j.isStale

  return {
    id: j.id,
    co: j.co,
    coInitial: j.co.slice(0, 1).toUpperCase(),
    logoBg: logoBg(j.co),
    role: j.role,
    ago: j.ago,
    metaLine: [formatJobLocation({ location: j.location }), prettyMode(j.mode), j.ago].filter(Boolean).join(" · "),
    grade,
    hasGrade: !!grade,
    gradeFg: isC ? "#f59e0b" : "#8b8b84",
    gradeBd: isC ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.13)",
    checkDetails,
    fit: j.fit,
    ringColor: ringColor(j.fit),
    verdict: verdictWord(j.fit, j.verdict),
    chips: shown,
    hasExtra: extra > 0,
    extra: `+${extra}`,
    move: j.move ? `→ ${j.move}` : "",
    moveFg: j.fit >= 70 ? "var(--mm-accent)" : j.fit >= 40 ? "#f59e0b" : "#8b8b84",
    verified: j.verified,
    sourceUrl: j.sourceUrl,
  }
}

function prettyMode(mode?: string | null): string {
  if (!mode) return ""
  const m = mode.toLowerCase()
  if (m === "onsite") return "On-site"
  if (m === "hybrid") return "Hybrid"
  if (m === "remote") return "Remote"
  if (m === "unknown") return ""
  return mode
}

/** Honest, derived "next move" line (the handoff's copy is authored per-job;
 *  we derive from verdict + gap count so it never lies). */
function deriveMove(fit: number, verdict: string | null | undefined, gapCount: number, checkDetails: boolean): string {
  if (checkDetails) return "Check details first"
  if (verdict === "strong" || fit >= 70) return "Tailor & apply"
  if (gapCount > 0) return `Close ${gapCount} gap${gapCount === 1 ? "" : "s"} first`
  return "Worth a look"
}

export function feedItemToRow(j: JobFeedItem): MobileJobRow {
  const fit = j.match_score ?? j.overall_score ?? 0
  const matched = j.matched_skills ?? []
  const gaps = (j.skills ?? []).filter(s => !matched.includes(s))
  const checkDetails =
    j.legitimacy_tier === "caution" || j.legitimacy_tier === "suspicious" || !!j.is_stale
  return buildRow({
    id: j.job_id,
    co: j.company_name ?? "—",
    role: j.job_title,
    location: j.location ?? j.location_city ?? j.location_country ?? null,
    mode: j.location_mode ?? null,
    ago: compactAge(j.last_seen_at ?? j.first_seen),
    fit,
    verdict: j.verdict,
    grade: j.grade,
    legitimacyTier: j.legitimacy_tier,
    isStale: j.is_stale,
    matched,
    gaps,
    sourceUrl: j.source_url ?? null,
    verified: j.last_seen_at ? `verified ${compactAge(j.last_seen_at)} ago` : "",
    move: deriveMove(fit, j.verdict, gaps.length, checkDetails),
  })
}

export function matchToRow(m: JobMatch): MobileJobRow {
  const fit = m.match_score ?? m.overlap_score ?? 0
  const matched = m.matched_skills ?? []
  const gaps = m.missing_skills ?? []
  return buildRow({
    id: m.job_id,
    co: m.company ?? "—",
    role: m.title,
    location: m.location ?? m.location_city ?? m.location_country ?? null,
    mode: m.location_mode ?? m.work_mode ?? null,
    ago: compactAge(m.date_posted),
    fit,
    verdict: m.verdict,
    grade: null,
    isStale: false,
    matched,
    gaps,
    sourceUrl: m.source_url ?? null,
    verified: "",
    move: deriveMove(fit, m.verdict, gaps.length, false),
  })
}
