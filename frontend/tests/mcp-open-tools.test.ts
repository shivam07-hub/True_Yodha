import test from "node:test"
import assert from "node:assert/strict"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { createMarketApi, type ApiOutcome, type MarketApi } from "../lib/mcp/market-api"
import {
  companyProfile,
  ghostJobs,
  registerOpenTools,
  searchJobs,
  skillDemand,
  skillsForRole,
} from "../lib/mcp/open-tools"
import { GET as routeGet, POST as routePost } from "../app/mcp/open/route"

/** The open MCP door (#63 §3A, O2): six read-only tools over market reads. */

type Call = { path: string; keyed: boolean }

function fakeApi(routes: Record<string, ApiOutcome<unknown>>): MarketApi & { calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    async read<T>(path: string, options?: { keyed?: boolean }): Promise<ApiOutcome<T>> {
      calls.push({ path, keyed: options?.keyed ?? false })
      const prefix = Object.keys(routes).find((p) => path.startsWith(p))
      if (!prefix) return { ok: false, status: 404, detail: null }
      return routes[prefix] as ApiOutcome<T>
    },
  }
}

const data = <T,>(value: T): ApiOutcome<T> => ({ ok: true, data: value })
const structured = <T,>(result: { structuredContent?: unknown }): T => result.structuredContent as T

type Job = { first_seen: string | null; tailor_url: string }

test("search_jobs sends the structured filters on the keyed read and links each job to its tailor page", async () => {
  const api = fakeApi({
    "/partner/v1/market/jobs": data({
      jobs: [{ job_id: "j 1", title: "Product Manager", company: "Acme", location_city: "Bengaluru",
        location_country: "India", work_mode: "hybrid", first_seen: "2026-11-20" }],
      total: 11,
      relaxed: [],
    }),
  })

  const result = await searchJobs(api, { role: "product manager", city: "Bengaluru", work_mode: "hybrid", limit: 5 })

  assert.equal(result.isError, undefined)
  assert.deepEqual(api.calls, [{
    path: "/partner/v1/market/jobs?role=product+manager&limit=5&city=Bengaluru&mode=hybrid",
    keyed: true,
  }])
  const out = structured<{ jobs: Job[]; total: number; more_url: string }>(result)
  assert.equal(out.total, 11)
  assert.equal(out.jobs[0].first_seen, "2026-11-20")
  assert.equal(out.jobs[0].tailor_url, "https://himyro.com/cv?jobId=j+1&utm_source=mcp&utm_campaign=myro_search_jobs")
  assert.equal(out.more_url, "https://himyro.com/intel?search=product+manager+Bengaluru&utm_source=mcp&utm_campaign=myro_search_jobs")
})

test("skills_for_role passes an empty family list through as an answer, not an error", async () => {
  const api = fakeApi({
    "/partner/v1/market/role-skills": data({ role: "astronaut", families: [], refreshed_at: null }),
  })

  const result = await skillsForRole(api, { role: "astronaut" })

  assert.equal(result.isError, undefined)
  assert.deepEqual(structured<{ families: unknown[] }>(result).families, [])
  assert.equal(api.calls[0].keyed, true)
})

const intel = {
  company_id: 1, company_name: "Acme Corp", slug: "acme-corp", as_of: "2026-11-20T00:00:00Z", source_run_id: null,
  skills: [{ skill_id: 1, display_name: "SQL", taxonomy_key: "sql", domain: "Data", current_job_count: 12,
    peak_job_count: 20, observation_run_count: 4, avg_required_level: null, trend_signal: "emerging",
    first_seen_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-11-20T00:00:00Z" }],
  newsletter_summary: { top_skills: ["SQL"], emerging_skills: ["SQL"], declining_skills: [], dormant_skills: [] },
}

test("company_profile reads jobs under the resolved name and links its Myro page", async () => {
  const api = fakeApi({
    "/companies/acme/skill-intelligence": data(intel),
    "/companies/Acme%20Corp/jobs": data({ company_name: "Acme Corp", total: 42, page: 1, page_size: 10, has_next: true,
      jobs: [{ job_id: "j9", title: "Analyst", location: null, location_city: "Pune", location_country: "India",
        location_mode: "onsite", primary_skills: [] }] }),
  })

  const out = structured<{ company: string; open_roles: number | null; skills: unknown[]; jobs: Job[]; profile_url: string }>(
    await companyProfile(api, { company: "acme" }),
  )

  assert.equal(out.company, "Acme Corp")
  assert.equal(out.open_roles, 42)
  assert.deepEqual(out.skills, [{ skill: "SQL", domain: "Data", open_listings: 12, trend: "emerging" }])
  assert.equal(out.jobs[0].tailor_url, "https://himyro.com/cv?jobId=j9&utm_source=mcp&utm_campaign=myro_company_profile")
  assert.equal(out.profile_url, "https://himyro.com/companies/acme-corp?utm_source=mcp&utm_campaign=myro_company_profile")
})

test("company_profile with an unread role count says null, not zero", async () => {
  const api = fakeApi({ "/companies/acme/skill-intelligence": data(intel) })

  const out = structured<{ open_roles: number | null; jobs: Job[] }>(await companyProfile(api, { company: "acme" }))

  assert.equal(out.open_roles, null)
  assert.deepEqual(out.jobs, [])
})

test("company_profile for an unknown name offers close names to call again with", async () => {
  const api = fakeApi({ "/jobs/companies/search": data(["Infosys", "Infosys BPM", "infosy"]) })

  const result = await companyProfile(api, { company: "infosy" })

  assert.equal(result.isError, true)
  const text = (result.content[0] as { text: string }).text
  assert.match(text, /Close names: Infosys, Infosys BPM\./)
})

test("skill_demand without a city lists the covered cities; with skills it does not", async () => {
  const cities = data({ cities: [{ city: "Mumbai", live_roles: 900 }], computed_at: "2026-11-21T00:00:00Z" })

  type Demand = { city: string | null; cities: unknown[] }
  const bare = structured<Demand>(await skillDemand(fakeApi({ "/jobs/skill-demand/cities": cities }), {}))
  assert.equal(bare.city, null)
  assert.deepEqual(bare.cities, [{ city: "Mumbai", live_roles: 900 }])

  const full = fakeApi({
    "/jobs/skill-demand/cities": cities,
    "/jobs/skill-demand?": data({ city: "Mumbai", window: "30d", skills: [{ skill: "SQL", roles: 40, companies: 9 }], computed_at: null }),
  })
  const out = structured<Demand>(await skillDemand(full, { city: "Mumbai" }))
  assert.deepEqual(out.cities, [])
  assert.equal(full.calls.length, 1)
})

test("ghost_jobs narrows to the named employer and never returns more than 20", async () => {
  const rates = { period: "all", listings_closed: 50, feed_overlap: 40, still_advertised: 10,
    still_advertised_rate: 0.25, avg_days_still_advertised: 12, ad_pulled_after_close: 30,
    median_days_to_pull: 3, median_observed_days: 20 }
  const row = (name: string) => ({ scope_key: name, ...rates })
  const index = data({
    method: "m", computed_at: "2026-11-21T00:00:00Z",
    // The live corpus row names no scope (read 2026-11-22). A fixture that
    // gave it one hid the output-validation failure the first real call hit.
    overall: { ...rates, listings_conclusive: 1, listings_live: 1, listings_inconclusive: 1 },
    months: [], sectors: [], companies: [...Array.from({ length: 30 }, (_, i) => row(`Co ${i}`)), row("Accenture")],
    coverage: { min_cell: 20, companies_published: 31, companies_with_closures: 80, companies_in_corpus: 400 },
  })

  type Ghost = { employers: Array<{ employer: string }>; min_listings: number }
  const all = structured<Ghost>(await ghostJobs(fakeApi({ "/public/ghost-index": index }), {}))
  assert.equal(all.employers.length, 20)
  assert.equal(all.min_listings, 20)

  const one = structured<Ghost>(await ghostJobs(fakeApi({ "/public/ghost-index": index }), { company: "accenture" }))
  assert.deepEqual(one.employers.map((e) => e.employer), ["Accenture"])
})

test("every API failure becomes a tool error that says what to do next", async () => {
  const cases: Array<[ApiOutcome<unknown>, RegExp]> = [
    [{ ok: false, status: 0, detail: null }, /Try again in a minute/],
    [{ ok: false, status: 429, detail: null }, /Wait a minute/],
    [{ ok: false, status: 503, detail: null }, /cannot serve live jobs right now/],
    [{ ok: false, status: 500, detail: null }, /HTTP 500/],
  ]
  for (const [outcome, message] of cases) {
    const result = await searchJobs(fakeApi({ "/partner": outcome }), { role: "analyst" })
    assert.equal(result.isError, true)
    assert.match((result.content[0] as { text: string }).text, message)
  }
})

test("market api: keyed reads carry the key, a missing key never leaves the server, a dead API is status 0", async () => {
  const seen: Array<{ url: string; auth: string | undefined }> = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    seen.push({ url, auth: headers.Authorization })
    if (url.endsWith("/down")) throw new Error("ECONNREFUSED")
    if (url.endsWith("/html")) return new Response("<html>bad gateway</html>", { status: 502 })
    return new Response(JSON.stringify({ fine: true }), { status: 200 })
  }) as typeof fetch

  const api = createMarketApi({ baseUrl: "https://api.example/", partnerKey: "k_1", fetchImpl })
  assert.deepEqual(await api.read("/partner/v1/x", { keyed: true }), { ok: true, data: { fine: true } })
  assert.equal(seen[0].url, "https://api.example/partner/v1/x")
  assert.equal(seen[0].auth, "Bearer k_1")
  assert.deepEqual(await api.read("/public/x"), { ok: true, data: { fine: true } })
  assert.equal(seen[1].auth, undefined)
  assert.deepEqual(await api.read("/down"), { ok: false, status: 0, detail: null })
  assert.deepEqual(await api.read("/html"), { ok: false, status: 502, detail: null })

  const keyless = createMarketApi({ baseUrl: "https://api.example", partnerKey: undefined, fetchImpl })
  const before = seen.length
  assert.deepEqual(await keyless.read("/partner/v1/x", { keyed: true }), { ok: false, status: 503, detail: null })
  assert.equal(seen.length, before)
})

test("a real MCP client lists six read-only tools, each with a title and an output schema", async () => {
  const server = new McpServer({ name: "myro-market", version: "1.0.0" })
  registerOpenTools(server, fakeApi({
    "/partner/v1/market/role-skills": data({ role: "pm", families: [{ family: "Product Management", open_roles: 143, core_skills: ["Roadmaps"] }], refreshed_at: null }),
  }))
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "test", version: "0" })
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])

  const { tools } = await client.listTools()
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "myro_company_profile", "myro_ghost_jobs", "myro_hiring_by_sector",
    "myro_search_jobs", "myro_skill_demand", "myro_skills_for_role",
  ])
  for (const tool of tools) {
    assert.ok(tool.name.length <= 64)
    assert.ok(tool.title, `${tool.name} has a title`)
    assert.ok(tool.outputSchema, `${tool.name} has an output schema`)
    assert.equal(tool.annotations?.readOnlyHint, true)
    assert.equal(tool.annotations?.destructiveHint, false)
  }

  const called = await client.callTool({ name: "myro_skills_for_role", arguments: { role: "pm" } })
  assert.equal(called.isError, undefined)
  assert.equal((called.structuredContent as { families: unknown[] }).families.length, 1)
  await client.close()
})

test("the route answers initialize over POST as JSON and refuses GET", async () => {
  const response = await routePost(new Request("https://himyro.com/mcp/open", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
    }),
  }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("mcp-session-id"), null)
  const body = await response.json() as { result: { serverInfo: { name: string }; capabilities: { tools?: unknown } } }
  assert.equal(body.result.serverInfo.name, "myro-market")
  assert.ok(body.result.capabilities.tools)

  assert.equal(routeGet().status, 405)
})
