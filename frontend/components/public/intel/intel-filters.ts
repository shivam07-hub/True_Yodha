import type { ResultJob, ResultCompany } from "./intel-results"

export function matchesQuickFilter(
  id: string,
  job: ResultJob,
  company: ResultCompany | undefined,
): boolean {
  switch (id) {
    case "remote":  return job.mode === "Remote"
    case "fresh":   return job.ageMin < 60 * 24
    case "ai":      return /AI|ML|Data|Research/i.test(company?.industry || "") || /AI|ML/i.test(job.title)
    case "fintech": return /Fin|Bank|Payment/i.test(company?.industry || "")
    case "design":  return /design/i.test(job.title)
    case "eu":      return ["UK", "GB", "DE", "FR", "NL", "PT", "IE", "ES", "IT"].includes(job.country)
    case "us":      return job.country === "US"
    case "india":   return job.country === "IN"
    default:        return true
  }
}

export function smartMatch(q: string, job: ResultJob): boolean {
  if (/\bremote\b/.test(q) && job.mode === "Remote") return true
  if (/\bhybrid\b/.test(q) && job.mode === "Hybrid") return true
  if (/\beurope\b/.test(q) && ["UK", "GB", "DE", "FR", "NL", "PT"].includes(job.country)) return true
  if (/\b(usa?|america)\b/.test(q) && job.country === "US") return true
  if (/\bindia\b/.test(q) && job.country === "IN") return true
  return false
}

// Map company → its dominant industry by name-hash. We don't have a true
// company→industry map in /jobs/analytics, so we synthesize a stable assignment.
export function industryForCompany(name: string, industries: string[]): string {
  if (!industries.length) return ""
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i)
  return industries[Math.abs(h) % industries.length]
}

export function countryForCompany(name: string, countries: string[]): string {
  if (!countries.length) return ""
  let h = 7
  for (let i = 0; i < name.length; i++) h = ((h << 3) + h) ^ name.charCodeAt(i)
  return countries[Math.abs(h) % countries.length]
}

// Public mirror "uptime" anchor — feels live without a server round-trip.
const UPTIME_ANCHOR = new Date("2026-04-11T00:00:00Z").getTime()

export function formatUptime(now: number): string {
  const ms = Math.max(0, now - UPTIME_ANCHOR)
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`
}

export function seedAge(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i)
  return 5 + (Math.abs(h) % 600)
}
