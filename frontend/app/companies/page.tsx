import type { Metadata } from "next"
import { jobs } from "@/lib/api"
import { CompanyLink } from "@/components/companies/company-link"
import { formatCount } from "@/lib/format"

/**
 * The companies directory — a SERVER-rendered hub linking to every company page.
 *
 * Why this exists (SEO/AEO): the interactive /intel pane fetches its company
 * list client-side, so those links never reach the initial HTML — a crawler or
 * AI engine that doesn't run JS sees nothing, and the ~260 /companies/{name}
 * pages stay orphaned. This page fetches the list on the server and renders the
 * links into the HTML directly: no JS required, bulletproof for every crawler.
 * Paired with sitemap.ts (which now emits every company URL).
 *
 * Public data (jobs.analytics has no auth), revalidated hourly (ISR).
 */
const BASE = "https://www.himyro.com"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Companies hiring now — Myro",
  description:
    "Browse every company Myro tracks and jump to their live open roles. Hundreds of companies, updated from live job data.",
  alternates: { canonical: `${BASE}/companies` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Companies hiring now — Myro",
    description: "Browse every company Myro tracks and jump to their live open roles.",
    type: "website",
    url: `${BASE}/companies`,
  },
}

export default async function CompaniesDirectory() {
  let companies: { name: string; count: number }[] = []
  try {
    const analytics = await jobs.analytics()
    companies = (analytics.by_company ?? [])
      .filter((c) => c.name)
      .map((c) => ({ name: c.name, count: c.count }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    // Backend unreachable at render time → render the shell; ISR retries on the
    // next request. Never 500 a crawlable page over a transient fetch.
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 24px 80px" }}>
      <div
        style={{
          fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--tm-interactive)", marginBottom: 10,
        }}
      >
        Live job database
      </div>
      <h1 style={{ margin: 0, fontSize: 36, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--tm-text)" }}>
        Companies hiring now
      </h1>
      <p style={{ marginTop: 12, fontSize: 15, color: "var(--tm-text-muted)", maxWidth: 560, lineHeight: 1.6 }}>
        {companies.length > 0
          ? `Every one of the ${formatCount(companies.length)} companies Myro tracks. Open any company to see its live roles.`
          : "Loading the company list — check back in a moment."}
      </p>

      {companies.length > 0 && (
        <ul
          style={{
            listStyle: "none", margin: "32px 0 0", padding: 0,
            display: "grid", gap: "2px",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          }}
        >
          {companies.map((c) => (
            <li key={c.name}>
              <div
                style={{
                  display: "flex", alignItems: "baseline", justifyContent: "space-between",
                  gap: 12, padding: "9px 12px", borderRadius: "var(--tm-radius-sm)",
                }}
              >
                <CompanyLink company={c.name} />
                <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)", flexShrink: 0 }}>
                  {formatCount(c.count)} open
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
