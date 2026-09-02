import type { JobFeedItem, JobMatch } from "@/lib/api"
import { formatJobLocation } from "@/lib/format-location"
import { fitTier } from "@/lib/dashboard/feed-model"
import { matchFitScore, verdictLabel, verdictMove } from "@/lib/jobs/match-verdict"

/* ══════════════════════════════════════════════════════════════════════════
   job-model — normalises a real JobFeedItem (Jobs feed) or JobMatch
   (Collections, via synthMatch) into the row shape the handoff cards render.
   Keeps the design's colour/verdict/grade/chip logic in ONE place so Jobs and
   Collections stay pixel-identical. Ring geometry (dashoffset) is computed at
   the call-site since the circle radius differs per surface.

   Backlog #36 Slice 3 (brain-everywhere): the DECISIONS — fit number, verdict
   word, fit tier, next move — are read from the canonical Match Verdict seam
   (`lib/jobs/match-verdict` + `fitTier`), NOT re-derived from score bands here.
   Only the mm PRESENTATION (colours) is local. Previously this module invented
   verdicts from the fit band (collapsing "strong" into "worth it", inventing
   "long shot") and mixed the 0–5 overall_score into the 0–100 fit — a card
   deciding "how good" itself instead of reading the one server MatchEval.
   ══════════════════════════════════════════════════════════════════════════ */

// mm palette for the canonical fit tier — the BOUNDARY (65/40) is shared with
// desktop (`fitTier`); only these colours are the mobile design's own.
const MM_TIER_COLOR: Record<ReturnType<typeof fitTier>, string> = {
  strong: "#4ade80",
  mid: "#f59e0b",
  low: "#fb7185",
}

// Verdict → ring/word hue (the ranked card). Hue tracks the VERDICT so the ring
// and the word below it always agree — matching desktop's verdict-driven ring.
// Never orange (that's the accent CTA). Falls back to the fit tier when unranked.
const MM_VERDICT_COLOR: Record<NonNullable<JobFeedItem["verdict"]>, string> = {
  strong: "#4ade80",
  worth_it: "#f59e0b",
  stretch: "#a6a69e",
  checking: "#71716a",
}

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

/** The mm fit-ring colour for a 0–100 fit — canonical tier (`fitTier`, 65/40),
 *  mm palette. */
export function ringColor(fit: number): string {
  return MM_TIER_COLOR[fitTier(fit)]
}

/** Ring/word hue for a ranked card — verdict-driven, tier fallback when unranked. */
export function verdictColor(verdict: JobFeedItem["verdict"], fit: number): string {
  return verdict ? MM_VERDICT_COLOR[verdict] : ringColor(fit)
}

/** The verdict WORD — the ONE server-derived label (`verdictLabel`), never a
 *  score-band guess. Empty when the brain hasn't ranked the card, so the card
 *  never claims a verdict it doesn't have (opening it warms one). `checking` is
 *  that case too, which this missed: `verdictLabel` returns null for it. */
function verdictWord(verdict: JobFeedItem["verdict"]): string {
  return (verdict && verdictLabel(verdict)) || ""
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
  verdict?: JobFeedItem["verdict"]
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
    ringColor: verdictColor(j.verdict, j.fit),
    verdict: verdictWord(j.verdict),
    chips: shown,
    hasExtra: extra > 0,
    extra: `+${extra}`,
    move: j.move ? `→ ${j.move}` : "",
    moveFg: moveColorForTier(j.fit),
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

/** mm move-line colour keyed off the canonical fit tier (65/40), mm palette. */
function moveColorForTier(fit: number): string {
  const t = fitTier(fit)
  return t === "strong" ? "var(--mm-accent)" : t === "mid" ? "#f59e0b" : "#8b8b84"
}

/** The "next move" line — the canonical verdict→intent (`verdictMove`), with the
 *  mobile-only "check details" liveness prefix. Un-warmed (no server verdict) →
 *  the neutral "Worth a look", never a score-band claim (Slice 3). */
function deriveMove(verdict: JobFeedItem["verdict"], gapCount: number, checkDetails: boolean): string {
  if (checkDetails) return "Check details first"
  return verdictMove(verdict, gapCount)?.label ?? "Worth a look"
}

export function feedItemToRow(j: JobFeedItem): MobileJobRow {
  const fit = matchFitScore(j)
  const matched = j.matched_skills ?? []
  const gaps = (j.skills ?? []).filter(s => !matched.includes(s))
  return buildRow({
    id: j.job_id,
    co: j.company_name ?? "—",
    role: j.job_title,
    location: j.location ?? j.location_city ?? j.location_country ?? null,
    mode: j.location_mode ?? null,
    ago: compactAge(j.last_seen_at ?? j.first_seen),
    fit,
    verdict: j.verdict,
    grade: null,
    legitimacyTier: j.legitimacy_tier,
    isStale: j.is_stale,
    matched,
    gaps,
    sourceUrl: j.source_url ?? null,
    verified: j.last_seen_at ? `verified ${compactAge(j.last_seen_at)} ago` : "",
    move: "",
  })
}

export function matchToRow(m: JobMatch): MobileJobRow {
  const fit = matchFitScore(m)
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
    grade: m.grade ?? null,
    legitimacyTier: m.legitimacy_tier,
    isStale: false,
    matched,
    gaps,
    sourceUrl: m.source_url ?? null,
    verified: "",
    move: deriveMove(m.verdict, gaps.length, false),
  })
}
