import { formatCount, formatDate } from "@/lib/format"

export type CompanySignalMode = "roles" | "scraped"

export interface CompanySignalMetaInput {
  openCount: number
  lastSeenAt?: string | null
}

export function companySignalHeading(): string {
  return "Company signals"
}

export function companySignalSortParam(mode: CompanySignalMode): "roles" | "last_seen" {
  return mode === "scraped" ? "last_seen" : "roles"
}

export function companySignalMeta(row: CompanySignalMetaInput, mode: CompanySignalMode): string {
  const roleLabel = `${formatCount(row.openCount)} role${row.openCount === 1 ? "" : "s"}`
  if (mode === "roles") return roleLabel
  const dateLabel = formatScrapeDate(row.lastSeenAt)
  return `${dateLabel} · ${roleLabel}`
}

function formatScrapeDate(value?: string | null): string {
  const label = value ? formatDate(value, "short") : ""
  return label || "date n/a"
}
