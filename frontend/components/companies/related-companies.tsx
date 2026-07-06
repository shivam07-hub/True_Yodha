import { cache } from "react"
import { jobs } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { pickRelatedCompanies, type CompanyRef } from "@/lib/companies/related"

/**
 * Server-rendered "more companies" mesh for the bottom of every company page.
 *
 * Why (SEO/AEO): each /companies/{name} page linked UP to the hub but never
 * SIDEWAYS, so the ~260 detail pages were crawl-depth leaves — Google follows
 * hub → detail, finds no onward company link, and deprioritises deep crawl.
 *
 * The recommendation (same-industry first, then a mesh-guaranteeing backbone)
 * lives in `lib/companies/related.ts` — the single source shared with the
 * in-app CompanyDrawer, so anon and logged-in surfaces suggest identically.
 * This component is a thin adapter: fetch the company list, delegate selection,
 * render plain server <a> so the links are in the initial HTML for every
 * crawler and stay same-tab (a crawl mesh, not a UI affordance).
 */

const getCompanyRefs = cache(async (): Promise<CompanyRef[]> => {
  try {
    const analytics = await jobs.analytics()
    return (analytics.by_company ?? [])
      .filter((c) => c.name)
      .map((c) => ({ name: c.name, count: c.count, industry: c.industry }))
  } catch {
    return []
  }
})

export async function RelatedCompanies({ current }: { current: string }) {
  const all = await getCompanyRefs()
  if (all.length < 2) return null

  const neighbours = pickRelatedCompanies(all, current)
  if (neighbours.length === 0) return null

  return (
    <nav
      aria-label="More companies hiring"
      style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 24px 64px" }}
    >
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--tm-text)" }}>
        More companies hiring
      </h2>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--tm-text-muted)" }}>
        Explore live roles at other companies Myro tracks, or{" "}
        <a href="/companies" style={{ color: "var(--tm-accent-text)", textDecoration: "underline" }}>
          browse the full directory
        </a>
        .
      </p>
      <ul
        style={{
          listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "2px",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {neighbours.map((c) => (
          <li key={c.name}>
            <a
              href={`/companies/${encodeURIComponent(c.name)}`}
              style={{
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
                gap: 12, padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
                color: "var(--tm-text)", textDecoration: "none", fontSize: 14,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name} jobs
              </span>
              <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)", flexShrink: 0 }}>
                {formatCount(c.count)} open
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
