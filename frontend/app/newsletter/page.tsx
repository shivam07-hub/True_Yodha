import type { Metadata } from "next"
import Link from "next/link"
import { getAllIssues, type Issue, type IssueTheme } from "@/lib/newsletter"
import { IssueCard } from "@/components/newsletter/issue-card"
import { JourneyLoop } from "@/components/newsletter/journey-loop"
import { EmailSubscribe } from "@/components/newsletter/email-subscribe"
import styles from "./newsletter-index.module.css"

const BASE = "https://www.himyro.com"

// Each everyday loop noun maps to one or more content themes, so a clicked
// node filters the feed to that stage of the journey.
const STAGE_THEMES: Record<string, IssueTheme[]> = {
  jobs: ["heatmap"],
  gaps: ["skill"],
  skills: ["trajectory"],
  offers: ["boom-watch", "future-of-work"],
}
const STAGE_LABEL: Record<string, string> = {
  jobs: "Jobs", gaps: "Gaps", skills: "Skills", offers: "Offers",
}

export const metadata: Metadata = {
  title: "Myro Weekly - Free AI Hiring Live Job Data",
  description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings. No fluff.",
  alternates: { canonical: `${BASE}/newsletter` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Myro Weekly - Free AI Hiring Live Job Data",
    description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings.",
    type: "website",
    url: `${BASE}/newsletter`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro Weekly - Free AI Hiring Live Job Data",
    description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings.",
  },
}

const THEME_LABELS: Record<IssueTheme, string> = {
  heatmap: "Hiring heatmap",
  skill: "Skill of the week",
  trajectory: "Career trajectory",
  "boom-watch": "Boom watch",
  "future-of-work": "Future of work",
}

function topicClusters(issues: Issue[]) {
  const clusters = new Map<IssueTheme, { count: number; latest: Issue }>()
  for (const issue of issues) {
    const current = clusters.get(issue.theme)
    if (!current) {
      clusters.set(issue.theme, { count: 1, latest: issue })
    } else {
      current.count += 1
    }
  }
  return Array.from(clusters.entries()).map(([theme, data]) => ({
    theme,
    label: THEME_LABELS[theme],
    count: data.count,
    latest: data.latest,
  }))
}

export default async function NewsletterIndexPage({
  searchParams,
}: {
  searchParams: { stage?: string }
}) {
  const issues = await getAllIssues()
  const publishedIssues = issues.filter((i) => i.slug !== "_placeholder")

  // Stage filter (loop nodes). Unknown/absent stage = show everything.
  const activeStage =
    searchParams.stage && STAGE_THEMES[searchParams.stage] ? searchParams.stage : undefined
  const stageThemes = activeStage ? STAGE_THEMES[activeStage] : null
  const shownIssues = stageThemes
    ? publishedIssues.filter((i) => stageThemes.includes(i.theme))
    : publishedIssues

  const [featuredIssue, ...archiveIssues] = shownIssues
  const clusters = topicClusters(publishedIssues)

  // CollectionPage + ItemList + publisher entity: lets search + AI engines read
  // /newsletter as a recurring hiring-data publication (AEO — citable source),
  // not an untyped page. Mirrors the per-article Article/Breadcrumb schema.
  const indexJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Myro Weekly",
    description:
      "Free weekly hiring intelligence: company demand, skill gaps, and where hiring is moving — from live career-page data.",
    url: `${BASE}/newsletter`,
    isPartOf: { "@type": "WebSite", name: "Myro", url: BASE },
    publisher: {
      "@type": "Organization",
      name: "Myro",
      url: BASE,
      sameAs: [
        "https://x.com/himyro",
        "https://www.linkedin.com/company/himyro-career-intelligence",
      ],
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: publishedIssues.map((issue, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${BASE}/newsletter/${issue.slug}`,
        name: issue.title,
      })),
    },
  }

  return (
    <div className={styles.shell}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(indexJsonLd) }}
      />
      <header className={styles.masthead}>
        <div className={styles.copy}>
          <p className={styles.kicker}>Weekly hiring intelligence</p>
          <h1>Myro Weekly</h1>
          {publishedIssues.length > 0 && (
            <div className={styles.actions}>
              <Link href={`/newsletter/${publishedIssues[0].slug}`} className={styles.primaryLink}>
                Read latest
              </Link>
            </div>
          )}
        </div>
        <JourneyLoop activeStage={activeStage} />
      </header>

      {!featuredIssue ? (
        <section className={styles.empty}>
          <div className={styles.emptyMark} aria-hidden="true" />
          {activeStage ? (
            <>
              <h2>First {STAGE_LABEL[activeStage]} issue is coming</h2>
              <p>Subscribe to get it the week it drops — plus every issue in between.</p>
              <EmailSubscribe compact />
              <Link href="/newsletter" className={styles.secondaryLink} style={{ marginTop: 16 }}>
                ← All issues
              </Link>
            </>
          ) : (
            <>
              <h2>First issue coming soon</h2>
              <p>Subscribe to get notified when Issue 001 drops.</p>
              <EmailSubscribe compact />
            </>
          )}
        </section>
      ) : (
        <div className={styles.grid}>
          <main className={styles.main}>
            {activeStage && (
              <div className={styles.filterBar}>
                <span>{STAGE_LABEL[activeStage]} · {shownIssues.length} {shownIssues.length === 1 ? "issue" : "issues"}</span>
                <Link href="/newsletter">All issues</Link>
              </div>
            )}
            <IssueCard issue={featuredIssue} featured />

            {archiveIssues.length > 0 && (
              <section aria-labelledby="newsletter-archive">
                <div className={styles.sectionHead}>
                  <h2 id="newsletter-archive">{activeStage ? "More in this stage" : "Latest issues"}</h2>
                  <span>{archiveIssues.length} more</span>
                </div>
                <div className={styles.archiveList}>
                  {archiveIssues.map((issue) => (
                    <IssueCard key={issue.slug} issue={issue} />
                  ))}
                </div>
              </section>
            )}
          </main>

          <aside className={styles.rail} aria-label="Newsletter briefing">
            <section className={styles.panel}>
              <p className={styles.panelKicker}>Get it weekly</p>
              <h2>Hiring intel in your inbox</h2>
              <EmailSubscribe compact />
            </section>

            {/* Topic clusters earn a panel only once the taxonomy is real
                (≥2 themes). One theme = a dead single-row list → hidden. */}
            {clusters.length > 1 && (
              <section className={styles.panel}>
                <p className={styles.panelKicker}>Topic clusters</p>
                <div className={styles.clusters}>
                  {clusters.map((cluster) => (
                    <Link key={cluster.theme} href={`/newsletter/${cluster.latest.slug}`} className={styles.cluster}>
                      <span>{cluster.label}</span>
                      <strong>{cluster.count}</strong>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
