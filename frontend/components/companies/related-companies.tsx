import { cache } from "react"
import { jobs } from "@/lib/api"
import { formatCount } from "@/lib/format"

/**
 * Server-rendered "more companies" mesh for the bottom of every company page.
 *
 * Why (SEO/AEO): each /companies/{name} page linked UP to the hub but never
 * SIDEWAYS, so the ~260 detail pages were crawl-depth leaves — Google follows
 * hub → detail, finds no onward company link, and deprioritises deep crawl.
 * This block links each company to its alphabetical-ring neighbours, so every
 * company receives ~N inbound sideways links and emits ~N outbound. The ring
 * (wrap-around on the sorted name list) guarantees full connectivity with no
 * orphan and no hub-only bottleneck — deterministic, no "related" data needed.
 *
 * Plain server <a> (not the client CompanyLink) so the links are in the initial
 * HTML for every crawler and stay same-tab (a crawl mesh, not a UI affordance).
 */

const RING = 24

const getCompanyNames = cache(async (): Promise<{ name: string; count: number }[]> => {
  try {
    const analytics = await jobs.analytics()
    return (analytics.by_company ?? [])
      .filter((c) => c.name)
      .map((c) => ({ name: c.name, count: c.count }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
})

export async function RelatedCompanies({ current }: { current: string }) {
  const all = await getCompanyNames()
  if (all.length < 2) return null

  const idx = all.findIndex((c) => c.name === current)
  const start = idx === -1 ? 0 : idx + 1
  const neighbours: { name: string; count: number }[] = []
  for (let i = 1; i <= RING && neighbours.length < all.length - (idx === -1 ? 0 : 1); i++) {
    const c = all[(start + i - 1) % all.length]
    if (c.name !== current) neighbours.push(c)
  }
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
