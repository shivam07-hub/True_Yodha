// Hash-based fallbacks for cold-cache sparklines/velocities. Real backend
// velocity_bins + last_seen_at on `by_company` replace these when available.

import { formatCount } from "@/lib/format"

export interface QuickFilter {
  id: string
  label: string
}

// Only chips that map to a single backend analytics filter are shown. Category
// chips (AI/ML, Fintech, Design → industry/role), multi-country Europe, and
// freshness have no single-value backend filter yet — re-add when wired.
export const QUICK_FILTERS: QuickFilter[] = [
  { id: "remote", label: "Remote" },
  { id: "us", label: "US" },
  { id: "india", label: "India" },
]

// Chip → backend analytics location filter. Country chips are mutually exclusive
// (backend takes a single location_country); "remote" is an independent mode.
export const CHIP_FILTER: Record<string, { country?: string; mode?: "remote" }> = {
  remote: { mode: "remote" },
  us: { country: "US" },
  india: { country: "IN" },
}

export const COUNTRY_CHIP_IDS = ["us", "india"]

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  IN: "India",
  UK: "United Kingdom",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  SG: "Singapore",
  CA: "Canada",
  PT: "Portugal",
  IL: "Israel",
  AU: "Australia",
  JP: "Japan",
  IE: "Ireland",
  CH: "Switzerland",
  ES: "Spain",
  IT: "Italy",
}

// Deterministic logo color seeded from company name so reload is stable.
const LOGO_PALETTE = [
  "#635BFF", "#D97757", "#3395FF", "#5E6AD2", "#F24E1E",
  "#1FB8CD", "#FA520F", "#FFD21E", "#5773FF", "#632CA6",
  "#3ECF8E", "#FFC900", "#37C5C9", "#F2F0EB", "#E94B83",
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function logoColorFor(name: string): string {
  return LOGO_PALETTE[hashString(name) % LOGO_PALETTE.length]
}

export function velocityFor(name: string): number {
  const h = hashString(name)
  const v = (h % 60) - 10 // range -10..49
  return v
}

export function sparkFor(name: string, roles: number): number[] {
  const h = hashString(name)
  const arr: number[] = []
  for (let i = 0; i < 14; i++) {
    const wave = Math.sin((h % 17) + i * 0.6) * (roles / 7)
    const noise = (((h >> (i % 8)) & 0xff) / 255 - 0.5) * (roles / 6)
    arr.push(Math.max(0, Math.round(roles / 14 + wave + noise)))
  }
  return arr
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

export function fmtAgeSec(sec: number): string {
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

/** Format a YYYYMMDD marker or ISO date string to YYYY-MM-DD. */
export function fmtBatch(iso: string): string {
  const s = iso.trim()
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return s.slice(0, 10)
}

export function fmtAgeMin(min: number | null | undefined): string | null {
  if (min == null || min <= 0) return null
  if (min < 60) return `${min}m ago`
  if (min < 60 * 24) return `${Math.floor(min / 60)}h ago`
  return `${Math.floor(min / (60 * 24))}d ago`
}

export function fmtNum(n: number): string {
  return formatCount(n)
}
