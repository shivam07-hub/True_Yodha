#!/usr/bin/env tsx
/**
 * gen-taxonomy-artifacts.ts
 *
 * Regenerates the /taxonomy page's tiered data artifacts (CONTEXT.md
 * "Taxonomy Read-Model") from Supabase:
 *
 *   public/data/taxonomy_skeleton.json   structure tier (domains -> clusters -> n)
 *   public/data/taxonomy_priority.json   priority tier (in-demand skills + band)
 *
 * The full index tier (public/data/skill_taxonomy.json) is unchanged — it is the
 * existing committed Lightcast tree.
 *
 * Reads two read-only views (taxonomy_skeleton_v, taxonomy_priority_v) so the
 * GROUP BY / active-job aggregation stays in Postgres. The demand band is
 * re-derived from the active-job count via bandFromCorpusJobCount() — the single
 * demand vocabulary the Skills page also uses (lib/demand-band.ts), so the badge
 * can't drift.
 *
 * Forward-only: run after a weekly scrape + csv_importer load. Committed, NOT
 * wired into prebuild (no build-time DB coupling).
 *
 * taxonomy_priority_v is a MATERIALIZED view (the live aggregation trips the
 * PostgREST statement timeout), so refresh it before regenerating:
 *   REFRESH MATERIALIZED VIEW taxonomy_priority_v;
 *
 * Usage (run from frontend/ so deps resolve, or set NODE_PATH to its node_modules):
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... tsx ../scripts/gen-taxonomy-artifacts.ts
 *   tsx ../scripts/gen-taxonomy-artifacts.ts --dry-run   # counts only, no writes
 */

import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"
import { bandFromCorpusJobCount } from "../frontend/lib/demand-band"

const DRY_RUN = process.argv.includes("--dry-run")
const OUT_DIR = path.resolve(__dirname, "..", "frontend", "public", "data")

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env.")
  process.exit(1)
}

const db = createClient(URL, KEY, { auth: { persistSession: false } })

/** PostgREST caps a page at 1000 rows; pull every row of a view. */
async function selectAll<T>(view: string, columns: string): Promise<T[]> {
  const out: T[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(view).select(columns).range(from, from + PAGE - 1)
    if (error) throw new Error(`${view}: ${error.message}`)
    if (!data?.length) break
    out.push(...(data as T[]))
    if (data.length < PAGE) break
  }
  return out
}

interface SkelRow { domain: string; cluster: string; n: number }
interface PrioRow { name: string; domain: string; cluster: string; jobs: number }

async function main() {
  // ── structure tier ────────────────────────────────────────────────────────
  const skelRows = await selectAll<SkelRow>("taxonomy_skeleton_v", "domain,cluster,n")
  const byDomain = new Map<string, SkelRow[]>()
  for (const r of skelRows) (byDomain.get(r.domain) ?? byDomain.set(r.domain, []).get(r.domain)!).push(r)
  const skeleton = {
    _meta: { version: "1.0.0", tier: "structure" },
    name: "Categories",
    children: [...byDomain.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domain, rows]) => ({
        name: domain,
        clusters: rows
          .sort((a, b) => a.cluster.localeCompare(b.cluster))
          .map((r) => ({ name: r.cluster, n: r.n })),
      })),
  }
  const totalSkills = skelRows.reduce((a, r) => a + r.n, 0)

  // ── priority tier ─────────────────────────────────────────────────────────
  const prioRows = await selectAll<PrioRow>("taxonomy_priority_v", "name,domain,cluster,jobs")
  const skills = prioRows
    .map((r) => ({
      name: r.name,
      domain: r.domain,
      cluster: r.cluster,
      jobs: r.jobs,
      band: bandFromCorpusJobCount(r.jobs),
    }))
    .filter((s) => s.band !== "none") // membership == in the in-demand set
    .sort((a, b) => b.jobs - a.jobs)
  const priority = { _meta: { version: "1.0.0", tier: "priority" }, skills }

  console.log(
    `structure: ${skeleton.children.length} domains, ` +
      `${skelRows.length} clusters, ${totalSkills} skills`,
  )
  console.log(`priority:  ${skills.length} in-demand skills (>= 20 active jobs)`)

  if (DRY_RUN) {
    console.log("--dry-run: no files written.")
    return
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, "taxonomy_skeleton.json"), JSON.stringify(skeleton))
  fs.writeFileSync(path.join(OUT_DIR, "taxonomy_priority.json"), JSON.stringify(priority))
  console.log(`Wrote taxonomy_skeleton.json + taxonomy_priority.json to ${OUT_DIR}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
