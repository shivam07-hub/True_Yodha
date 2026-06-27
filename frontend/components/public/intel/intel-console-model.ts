export type ConsoleOp = "parse" | "fetch" | "index" | "embed"

export interface ConsoleCompany {
  name: string
  count: number
  last_seen_at?: string | null
}

export interface ConsoleSeed {
  op: ConsoleOp
  path: string
  meta: string
}

export const RUNNER_MODEL_LABELS = ["Local LM Studio", "google/gemma-3-4b"] as const

const OPS: ConsoleOp[] = ["fetch", "parse", "embed", "index"]

export function buildConsoleSeeds(companies: ConsoleCompany[]): ConsoleSeed[] {
  const realCompanies = companies
    .map((company) => ({
      ...company,
      name: company.name.trim(),
    }))
    .filter((company) => company.name.length > 0 && company.count > 0)

  if (!realCompanies.length) {
    return [{ op: "fetch", path: "tracked company feed", meta: "syncing" }]
  }

  return realCompanies.slice(0, 24).map((company, index) => ({
    op: OPS[index % OPS.length],
    path: company.name,
    meta: `${company.count.toLocaleString()} ${company.count === 1 ? "job" : "jobs"} - ${formatLastSeen(company.last_seen_at)}`,
  }))
}

function formatLastSeen(value?: string | null): string {
  if (!value) return "tracked"
  const date = value.trim().slice(0, 10)
  return date ? `scraped ${date}` : "tracked"
}
