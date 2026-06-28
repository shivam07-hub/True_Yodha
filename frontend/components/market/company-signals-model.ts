export type CompanySignalMode = "roles" | "scraped"

export interface CompanySignalMetaInput {
  openCount: number
  lastSeenAt?: string | null
}

const SCRAPE_DATE = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

export function companySignalHeading(): string {
  return "Company signals"
}

export function companySignalSortParam(mode: CompanySignalMode): "roles" | "last_seen" {
  return mode === "scraped" ? "last_seen" : "roles"
}

export function companySignalMeta(row: CompanySignalMetaInput, mode: CompanySignalMode): string {
  const roleLabel = `${row.openCount.toLocaleString()} role${row.openCount === 1 ? "" : "s"}`
  if (mode === "roles") return roleLabel
  const dateLabel = formatScrapeDate(row.lastSeenAt)
  return `${dateLabel} · ${roleLabel}`
}

function formatScrapeDate(value?: string | null): string {
  if (!value) return "date n/a"
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return "date n/a"
  return SCRAPE_DATE.format(new Date(time))
}
