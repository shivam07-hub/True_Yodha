/**
 * The open door's six tools (ARCHITECTURE_MCP.md §3A, O2). No sign-in.
 *
 * Each tool answers one market question from a read the API already serves,
 * shapes it to what the website shows a visitor, and links back to the Myro
 * page that carries the next step. Nothing here ranks, scores or filters
 * beyond bounding a page; nothing here returns job-description text or
 * anything about a person.
 */
import { z } from "zod"

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import type {
  CompanyJobsResponse,
  CompanySkillIntelligence,
  GhostIndexResponse,
  GhostIndexRow,
  HiringPanelResponse,
  MarketJobsResponse,
  RoleSkillsResponse,
  SkillDemand,
  SkillDemandCities,
} from "../api"
import type { ApiOutcome, MarketApi } from "./market-api"

export const SITE = "https://himyro.com"

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const GHOST_EMPLOYER_LIMIT = 20
const SECTOR_LIST_LIMIT = 5

/** A Myro link that says which tool sent the visitor (lib/attribution.ts). */
export function siteUrl(path: string, tool: string, params: Record<string, string> = {}): string {
  const url = new URL(path, SITE)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set("utm_source", "mcp")
  url.searchParams.set("utm_campaign", tool)
  return url.toString()
}

function tailorUrl(jobId: string, tool: string): string {
  return siteUrl("/cv", tool, { jobId })
}

function isoDay(unixSeconds: number | null): string | null {
  if (unixSeconds === null || !Number.isFinite(unixSeconds)) return null
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

function ok<T extends Record<string, unknown>>(data: T): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data }
}

function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true }
}

/** Every API failure as a sentence that says what to do next. */
export function explain(outcome: Extract<ApiOutcome<unknown>, { ok: false }>, what: string): CallToolResult {
  if (outcome.status === 0) return fail(`Myro did not answer in time while reading ${what}. Try again in a minute.`)
  if (outcome.status === 429) return fail(`Too many requests to Myro right now. Wait a minute, then try ${what} again.`)
  if (outcome.status === 422) return fail(`Myro could not read that request for ${what}: ${outcome.detail ?? "check the inputs"}.`)
  if (outcome.status === 503) return fail(`Myro cannot serve ${what} right now. Try again later.`)
  return fail(`Myro could not answer ${what} (HTTP ${outcome.status}). Try again later.`)
}

// ── Output schemas ──────────────────────────────────────────────────────────

const jobOut = z.object({
  job_id: z.string(),
  title: z.string(),
  company: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  work_mode: z.string().nullable(),
  first_seen: z.string().nullable().describe("Day Myro first saw the listing, YYYY-MM-DD."),
  tailor_url: z.string().describe("Myro page that tailors a CV for this job, then downloads it and opens the employer's application."),
})

const searchJobsOut = {
  jobs: z.array(jobOut),
  total: z.number().int().describe("Matching live roles, of which `jobs` is the first page."),
  relaxed: z.array(z.string()).describe("Filters dropped because too few roles matched them, e.g. ['location']."),
  more_url: z.string().describe("The same search on Myro."),
}

const skillsForRoleOut = {
  role: z.string(),
  families: z.array(z.object({
    family: z.string(),
    open_roles: z.number().int(),
    core_skills: z.array(z.string()).describe("Most-asked skills first."),
  })),
  refreshed_at: z.string().nullable(),
}

const companyOut = {
  company: z.string(),
  as_of: z.string().nullable(),
  open_roles: z.number().int().nullable().describe("Null when the role count could not be read."),
  skills: z.array(z.object({
    skill: z.string(),
    domain: z.string(),
    open_listings: z.number().int(),
    trend: z.enum(["emerging", "steady", "declining", "dormant"]),
  })),
  emerging_skills: z.array(z.string()),
  declining_skills: z.array(z.string()),
  jobs: z.array(z.object({
    job_id: z.string(),
    title: z.string(),
    city: z.string().nullable(),
    work_mode: z.string().nullable(),
    tailor_url: z.string(),
  })),
  profile_url: z.string(),
}

const skillDemandOut = {
  city: z.string().nullable(),
  window: z.enum(["30d", "all"]),
  skills: z.array(z.object({
    skill: z.string(),
    roles: z.number().int(),
    companies: z.number().int().describe("Distinct employers asking."),
  })),
  cities: z.array(z.object({ city: z.string(), live_roles: z.number().int() }))
    .describe("Cities Myro covers. Filled when no city was given or the city had no data."),
  computed_at: z.string().nullable(),
}

const sectorOut = z.object({
  sector: z.string(),
  live_roles: z.number().int(),
  employers: z.number().int(),
  new_roles_30d: z.number().int(),
  top_roles: z.array(z.string()),
  top_skills: z.array(z.string()),
  still_advertised_rate: z.number().nullable().describe("Share of closed roles still advertised. Null = withheld, not zero."),
})

const hiringOut = {
  computed_at: z.string(),
  sectors: z.array(sectorOut),
  sectors_published: z.number().int(),
  sectors_tracked: z.number().int(),
  page_url: z.string(),
}

const ghostRateOut = {
  listings_closed: z.number().int(),
  still_advertised: z.number().int(),
  still_advertised_rate: z.number().nullable().describe("Null = too few listings to publish a rate."),
  avg_days_still_advertised: z.number().nullable(),
  median_days_to_pull: z.number().nullable(),
}

const ghostOut = {
  computed_at: z.string(),
  overall: z.object(ghostRateOut).describe("Every employer Myro tracks, together."),
  employers: z.array(z.object({ employer: z.string(), ...ghostRateOut })),
  employers_published: z.number().int(),
  employers_in_corpus: z.number().int().nullable(),
  min_listings: z.number().int().describe("Employers with fewer jointly observed listings are not published."),
  page_url: z.string(),
}

// ── Handlers ────────────────────────────────────────────────────────────────

export async function searchJobs(
  api: MarketApi,
  args: { role: string; city?: string; country?: string; work_mode?: "remote" | "hybrid" | "onsite"; limit?: number },
): Promise<CallToolResult> {
  const params = new URLSearchParams({ role: args.role, limit: String(args.limit ?? 10) })
  if (args.city) params.set("city", args.city)
  if (args.country) params.set("country", args.country)
  if (args.work_mode) params.set("mode", args.work_mode)
  const outcome = await api.read<MarketJobsResponse>(`/partner/v1/market/jobs?${params}`, { keyed: true })
  if (!outcome.ok) return explain(outcome, "live jobs")
  const search = [args.role, args.city].filter(Boolean).join(" ")
  return ok({
    jobs: outcome.data.jobs.map((job) => ({
      job_id: job.job_id,
      title: job.title,
      company: job.company,
      city: job.location_city,
      country: job.location_country,
      work_mode: job.work_mode,
      first_seen: isoDay(job.first_seen),
      tailor_url: tailorUrl(job.job_id, "myro_search_jobs"),
    })),
    total: outcome.data.total,
    relaxed: outcome.data.relaxed,
    more_url: siteUrl("/intel", "myro_search_jobs", { search }),
  })
}

export async function skillsForRole(api: MarketApi, args: { role: string }): Promise<CallToolResult> {
  const params = new URLSearchParams({ role: args.role, limit: "3" })
  const outcome = await api.read<RoleSkillsResponse>(`/partner/v1/market/role-skills?${params}`, { keyed: true })
  if (!outcome.ok) return explain(outcome, "the skills for that role")
  return ok({
    role: outcome.data.role,
    families: outcome.data.families,
    refreshed_at: outcome.data.refreshed_at,
  })
}

export async function companyProfile(api: MarketApi, args: { company: string }): Promise<CallToolResult> {
  const name = encodeURIComponent(args.company)
  const intel = await api.read<CompanySkillIntelligence>(`/companies/${name}/skill-intelligence?limit=15`)
  if (!intel.ok && intel.status === 404) {
    const close = await api.read<string[]>(`/jobs/companies/search?${new URLSearchParams({ q: args.company, limit: "5" })}`)
    const names = close.ok ? close.data.filter((n) => n.toLowerCase() !== args.company.toLowerCase()) : []
    return fail(
      names.length > 0
        ? `Myro tracks no employer named "${args.company}". Close names: ${names.join(", ")}. Call again with one of them.`
        : `Myro tracks no employer named "${args.company}". Try the employer's shorter or legal name.`,
    )
  }
  if (!intel.ok) return explain(intel, `the profile of ${args.company}`)

  const company = intel.data.company_name
  const jobs = await api.read<CompanyJobsResponse>(
    `/companies/${encodeURIComponent(company)}/jobs?page=1&page_size=10`,
  )
  return ok({
    company,
    as_of: intel.data.as_of,
    open_roles: jobs.ok ? jobs.data.total : null,
    skills: intel.data.skills.map((s) => ({
      skill: s.display_name,
      domain: s.domain,
      open_listings: s.current_job_count,
      trend: s.trend_signal,
    })),
    emerging_skills: intel.data.newsletter_summary.emerging_skills,
    declining_skills: intel.data.newsletter_summary.declining_skills,
    jobs: jobs.ok
      ? jobs.data.jobs.map((job) => ({
          job_id: job.job_id,
          title: job.title,
          city: job.location_city,
          work_mode: job.location_mode,
          tailor_url: tailorUrl(job.job_id, "myro_company_profile"),
        }))
      : [],
    profile_url: siteUrl(`/companies/${intel.data.slug}`, "myro_company_profile"),
  })
}

export async function skillDemand(
  api: MarketApi,
  args: { city?: string; window?: "30d" | "all" },
): Promise<CallToolResult> {
  const window = args.window ?? "30d"
  let city: string | null = null
  let skills: SkillDemand["skills"] = []
  let computedAt: string | null = null
  if (args.city) {
    const params = new URLSearchParams({ city: args.city, window, limit: "12" })
    const demand = await api.read<SkillDemand>(`/jobs/skill-demand?${params}`)
    if (!demand.ok) return explain(demand, `skill demand in ${args.city}`)
    city = demand.data.city
    skills = demand.data.skills
    computedAt = demand.data.computed_at ?? null
  }
  // The covered cities ride along whenever the answer has no skills in it, so
  // the assistant can pick a city Myro has instead of guessing again.
  let cities: SkillDemandCities["cities"] = []
  if (skills.length === 0) {
    const covered = await api.read<SkillDemandCities>("/jobs/skill-demand/cities")
    if (!covered.ok) return explain(covered, "the cities Myro covers")
    cities = covered.data.cities
    computedAt = computedAt ?? covered.data.computed_at ?? null
  }
  return ok({ city, window, skills, cities, computed_at: computedAt })
}

export async function hiringBySector(api: MarketApi, args: { sector?: string }): Promise<CallToolResult> {
  const panel = await api.read<HiringPanelResponse>("/public/hiring-panel")
  if (!panel.ok) return explain(panel, "hiring by sector")
  const wanted = args.sector?.trim().toLowerCase()
  const sectors = wanted
    ? panel.data.sectors.filter((s) => s.sector.toLowerCase().includes(wanted))
    : panel.data.sectors
  return ok({
    computed_at: panel.data.computed_at,
    sectors: sectors.map((s) => ({
      sector: s.sector,
      live_roles: s.live_roles,
      employers: s.employers,
      new_roles_30d: s.new_roles_30d,
      top_roles: s.top_roles.slice(0, SECTOR_LIST_LIMIT).map((r) => r.name),
      top_skills: s.top_skills.slice(0, SECTOR_LIST_LIMIT).map((r) => r.name),
      still_advertised_rate: s.still_advertised_rate,
    })),
    sectors_published: panel.data.coverage.sectors_published,
    sectors_tracked: panel.data.coverage.sectors_tracked,
    page_url: siteUrl("/hiring", "myro_hiring_by_sector"),
  })
}

function ghostRates(row: Omit<GhostIndexRow, "scope_key">) {
  return {
    listings_closed: row.listings_closed,
    still_advertised: row.still_advertised,
    still_advertised_rate: row.still_advertised_rate,
    avg_days_still_advertised: row.avg_days_still_advertised,
    median_days_to_pull: row.median_days_to_pull,
  }
}

export async function ghostJobs(api: MarketApi, args: { company?: string }): Promise<CallToolResult> {
  const index = await api.read<GhostIndexResponse>("/public/ghost-index")
  if (!index.ok) return explain(index, "the ghost job index")
  const wanted = args.company?.trim().toLowerCase()
  const employers = wanted
    ? index.data.companies.filter((row) => row.scope_key.toLowerCase().includes(wanted))
    : index.data.companies
  return ok({
    computed_at: index.data.computed_at,
    overall: ghostRates(index.data.overall),
    employers: employers
      .slice(0, GHOST_EMPLOYER_LIMIT)
      .map((row) => ({ employer: row.scope_key, ...ghostRates(row) })),
    employers_published: index.data.coverage.companies_published,
    employers_in_corpus: index.data.coverage.companies_in_corpus,
    min_listings: index.data.coverage.min_cell,
    page_url: siteUrl("/ghost-index", "myro_ghost_jobs"),
  })
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerOpenTools(server: McpServer, api: MarketApi): void {
  server.registerTool(
    "myro_search_jobs",
    {
      title: "Search live jobs",
      description:
        "Search roles employers are advertising now on their own career pages, as tracked by Myro. " +
        "Put the role in `role` and the place in `city` or `country`. Each job has a `tailor_url`: the Myro page " +
        "that tailors a CV for that job, downloads it, and opens the employer's application. " +
        "`relaxed` lists filters that were dropped because too few roles matched them.",
      inputSchema: {
        role: z.string().min(2).max(120).describe("Role or title words, e.g. 'product manager', 'data analyst'."),
        city: z.string().max(80).optional().describe("City, e.g. 'Bengaluru', 'Gurugram'."),
        country: z.string().max(80).optional().describe("Country, e.g. 'India'."),
        work_mode: z.enum(["remote", "hybrid", "onsite"]).optional(),
        limit: z.number().int().min(1).max(20).optional().describe("Jobs to return, default 10."),
      },
      outputSchema: searchJobsOut,
      annotations: { title: "Search live jobs", ...READ_ONLY },
    },
    (args) => searchJobs(api, args),
  )

  server.registerTool(
    "myro_skills_for_role",
    {
      title: "Skills a role asks for",
      description:
        "The skills live job listings ask for most in the role families that match a role, and how many listings " +
        "are open in each family. Families are named by field, e.g. 'Data Science', 'Product Management', " +
        "'Software Development'. When `families` is empty, call again with the field name instead of the job title.",
      inputSchema: {
        role: z.string().min(2).max(120).describe("Role or field, e.g. 'data scientist', 'product manager'."),
      },
      outputSchema: skillsForRoleOut,
      annotations: { title: "Skills a role asks for", ...READ_ONLY },
    },
    (args) => skillsForRole(api, args),
  )

  server.registerTool(
    "myro_company_profile",
    {
      title: "Company hiring profile",
      description:
        "What one employer is hiring for: the skills its live listings ask for, each with a trend " +
        "(emerging, steady, declining, dormant), how many roles it has open, and up to 10 of them. " +
        "If Myro does not track that name, the error lists close names to call again with.",
      inputSchema: {
        company: z.string().min(2).max(100).describe("Employer name, e.g. 'Deloitte', 'HDFC Bank'."),
      },
      outputSchema: companyOut,
      annotations: { title: "Company hiring profile", ...READ_ONLY },
    },
    (args) => companyProfile(api, args),
  )

  server.registerTool(
    "myro_skill_demand",
    {
      title: "Skills in demand by city",
      description:
        "The skills most asked for in live listings in one city, with how many roles and how many distinct " +
        "employers ask for each. Without a city, or for a city with no data, `cities` lists the cities Myro covers.",
      inputSchema: {
        city: z.string().min(1).max(120).optional().describe("City, e.g. 'Mumbai'."),
        window: z.enum(["30d", "all"]).optional().describe("Listings from the last 30 days (default) or all live listings."),
      },
      outputSchema: skillDemandOut,
      annotations: { title: "Skills in demand by city", ...READ_ONLY },
    },
    (args) => skillDemand(api, args),
  )

  server.registerTool(
    "myro_hiring_by_sector",
    {
      title: "Hiring by sector",
      description:
        "Which sectors are hiring now, largest live pool first: live roles, employers, new roles in the last 30 days, " +
        "top roles and skills, and the share of closed roles still advertised. Sectors below a minimum size are not " +
        "published; `sectors_published` against `sectors_tracked` says how many that leaves out.",
      inputSchema: {
        sector: z.string().max(80).optional().describe("Narrow to sectors whose name contains this, e.g. 'BFSI'."),
      },
      outputSchema: hiringOut,
      annotations: { title: "Hiring by sector", ...READ_ONLY },
    },
    (args) => hiringBySector(api, args),
  )

  server.registerTool(
    "myro_ghost_jobs",
    {
      title: "Ghost job index",
      description:
        "How often employers keep advertising roles after their own careers site has closed them. A rate is null " +
        `when there are too few listings to publish one; employers below \`min_listings\` are absent. Returns up to ${GHOST_EMPLOYER_LIMIT} ` +
        "employers, or the ones matching `company`. An employer missing from the answer has not been judged, not cleared.",
      inputSchema: {
        company: z.string().max(100).optional().describe("Employer to look up, e.g. 'Accenture'."),
      },
      outputSchema: ghostOut,
      annotations: { title: "Ghost job index", ...READ_ONLY },
    },
    (args) => ghostJobs(api, args),
  )
}
