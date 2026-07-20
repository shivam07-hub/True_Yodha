import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MDXRemote } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import { getAllIssues, getIssueBySlug, getRelatedIssues, getSpokesOf } from "@/lib/newsletter"
import { NewsletterRail, buildClusters } from "@/components/newsletter/rail"
import { NewsletterCTA } from "@/components/newsletter/issue-cta"
import { NewsletterFAQ } from "@/components/newsletter/newsletter-faq"
import { formatDate } from "@/lib/format"
import { HowToLadder } from "@/components/newsletter/howto-ladder"
import { DatasetDownload } from "@/components/newsletter/dataset-download"
import { HowMyroWorks } from "@/components/newsletter/how-myro-works"
import { ChartEmbed } from "@/components/newsletter/chart-embed"
import { ReadingProgress } from "@/components/newsletter/reading-progress"
import { ShareButton } from "@/components/newsletter/share-button"
import { NewsletterBackLink } from "@/components/newsletter/back-link"
import { TldrCard } from "@/components/newsletter/tldr-card"
import { StatCards } from "@/components/newsletter/stat-cards"
import { DataTable } from "@/components/newsletter/data-table"
import { LocationChart } from "@/components/newsletter/location-chart"
import { SkillsList } from "@/components/newsletter/skills-list"
import { CareerCards } from "@/components/newsletter/career-cards"
import { EmailSubscribe } from "@/components/newsletter/email-subscribe"
import { MethodologyBlock } from "@/components/newsletter/methodology-block"

interface Props {
  params: { slug: string }
}

export async function generateStaticParams() {
  const issues = await getAllIssues()
  return issues.map((i) => ({ slug: i.slug }))
}

const BASE = "https://www.himyro.com"

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const issue = await getIssueBySlug(params.slug)
  // Unknown slug → the page calls notFound() (404). Return explicit noindex so
  // the transient HTML never inherits the root's indexable default metadata.
  if (!issue) return { robots: { index: false, follow: false } }
  const title = issue.seoTitle ? `${issue.seoTitle} | Myro` : `${issue.title} | Myro Letters`
  const canonicalUrl = `${BASE}/newsletter/${issue.slug}`
  const absoluteOgImage = issue.ogImage
    ? issue.ogImage.startsWith("http") ? issue.ogImage : `${BASE}${issue.ogImage}`
    : undefined
  const ogImages = absoluteOgImage
    ? [{ url: absoluteOgImage, width: 1200, height: 630, alt: issue.ogImageAlt ?? issue.title }]
    : undefined
  const isoDate = new Date(issue.publishedAt).toISOString()
  return {
    title,
    description: issue.summary,
    alternates: { canonical: canonicalUrl },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
      },
    },
    openGraph: {
      title,
      description: issue.summary,
      type: "article",
      url: canonicalUrl,
      publishedTime: isoDate,
      ...(ogImages && { images: ogImages }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: issue.summary,
      ...(ogImages && { images: ogImages }),
    },
  }
}

const mdxComponents = {
  NewsletterCTA, ChartEmbed,
  TldrCard, StatCards, DataTable,
  LocationChart, SkillsList, CareerCards,
  EmailSubscribe, MethodologyBlock,
}

const mdxOptions = { mdxOptions: { remarkPlugins: [remarkGfm] } }

function themeLabel(theme: string) {
  return theme.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

export default async function IssuePage({ params }: Props) {
  const issue = await getIssueBySlug(params.slug)
  if (!issue) notFound()

  // 6, not 3 — the rail must fill a 4000px article's column (rail parity law).
  const moreIssues = await getRelatedIssues(issue, 6)
  const spokes = await getSpokesOf(issue.slug)
  const pillar = issue.sourceIssue ? await getIssueBySlug(issue.sourceIssue) : null
  const allIssues = await getAllIssues()
  const clusters = buildClusters(allIssues.filter((i) => i.slug !== "_placeholder"))

  const canonicalUrl = `${BASE}/newsletter/${issue.slug}`
  const date = formatDate(issue.publishedAt, "long")
  const initials = issue.authorInitials ?? "SP"
  const authorName = issue.authorName ?? "Shivam Pathak"
  const issueNum = issue.issueNumber ? String(issue.issueNumber).padStart(3, "0") : "001"
  const series = issue.seriesLabel ?? "Monday Hiring Heatmap"
  const mins = issue.readMinutes ?? 5

  const isoDate = new Date(issue.publishedAt).toISOString()
  const absoluteOgImage = issue.ogImage
    ? issue.ogImage.startsWith("http") ? issue.ogImage : `${BASE}${issue.ogImage}`
    : undefined
  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: issue.seoTitle ?? issue.title,
      datePublished: isoDate,
      description: issue.summary,
      author: { "@type": "Person", name: authorName },
      publisher: {
        "@type": "Organization",
        name: "Myro",
        url: BASE,
        sameAs: [
          "https://x.com/himyro",
          "https://www.linkedin.com/company/himyro-career-intelligence",
        ],
      },
      ...(absoluteOgImage && { image: absoluteOgImage }),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE },
        { "@type": "ListItem", position: 2, name: "Newsletter", item: `${BASE}/newsletter` },
        { "@type": "ListItem", position: 3, name: issue.title, item: canonicalUrl },
      ],
    },
  ]

  // FAQPage — presence-gated. AEO play (AI-citation), not Google rich result.
  // On-page accordion carries the same Q/A so the markup is backed by visible text.
  if (issue.faqs?.length) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: issue.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    })
  }

  // Dataset — per-issue, presence-gated. Aggregates only, CC BY 4.0, with a
  // crawlable CSV distribution → Google Dataset Search + AI citation.
  if (issue.dataset) {
    const d = issue.dataset
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: d.name,
      description: d.description,
      url: canonicalUrl,
      isAccessibleForFree: true,
      license: "https://creativecommons.org/licenses/by/4.0/",
      creator: { "@type": "Organization", name: "Myro", url: BASE },
      ...(d.spatialCoverage && { spatialCoverage: d.spatialCoverage }),
      ...(d.temporalCoverage && { temporalCoverage: d.temporalCoverage }),
      ...(d.variableMeasured?.length && { variableMeasured: d.variableMeasured }),
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "text/csv",
          contentUrl: `${canonicalUrl}/dataset.csv`,
        },
      ],
    })
  }

  // HowTo — trajectory issues only (presence-gated on steps). Backed by the
  // visible numbered ladder rendered in the value zone.
  if (issue.steps?.length) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: issue.seoTitle ?? issue.title,
      description: issue.summary,
      step: issue.steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    })
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ReadingProgress />

      <div className="nl-shell">
       <div className="nl-grid">
        <div style={{ minWidth: 0 }}>

        {/* Back link sits above the reading sheet */}
        <NewsletterBackLink />

        <article className="nl-article">

        {/* Issue tag */}
        <div className="nl-tagline">
          <span className="nl-tag">{themeLabel(issue.theme)}</span>
          <time dateTime={issue.publishedAt}>{date}</time>
        </div>

        {/* Headline + standfirst — serif publication voice */}
        <h1 className="nl-headline">{issue.title}</h1>
        <p className="nl-standfirst">{issue.summary}</p>

        {/* Byline — one line. It is provenance, not a section; it must not cost
            a screen of an acquisition page's above-the-fold budget. */}
        <div className="nl-byline">
          <div className="nl-byline-who">
            <div aria-hidden="true" className="nl-byline-avatar">{initials}</div>
            <span className="nl-byline-name">{authorName}</span>
            <span className="nl-byline-meta">
              Issue {issueNum} · {series} · {mins}-min read
            </span>
          </div>
          <ShareButton url={canonicalUrl} title={issue.title} />
        </div>

        {/* KEY NUMBERS — the above-the-fold data law. A data newsletter shows
            its data before its prose. Presence-gated on `keyStats` frontmatter:
            authored figures only, never derived or inferred here. */}
        {issue.keyStats?.length ? (
          <StatCards cards={issue.keyStats.map((s, i) => ({ ...s, accent: i === 0 }))} />
        ) : null}

        {/* ── VALUE ZONE — editorial only, no product pitch (see HowMyroWorks below the divider) ── */}
        {/* MDX content */}
        <div className="mdx-prose newsletter-prose">
          <MDXRemote source={issue.content} options={mdxOptions} components={mdxComponents} />
        </div>

        {/* Career-trajectory step ladder (HowTo source) */}
        {issue.steps?.length ? <HowToLadder steps={issue.steps} /> : null}

        {/* Citable open data (Dataset source) */}
        {issue.dataset ? <DatasetDownload slug={issue.slug} dataset={issue.dataset} /> : null}

        {/* Spoke → pillar link (hub-and-spoke cluster) */}
        {pillar ? (
          <p style={{ fontSize: 14, color: "var(--tm-text-muted)", marginTop: 32 }}>
            Built on{" "}
            <Link href={`/newsletter/${pillar.slug}`} style={{ color: "var(--tm-interactive)", textDecoration: "none" }}>
              {pillar.title}
            </Link>{" "}
            — this week&rsquo;s hiring data.
          </p>
        ) : null}

        {/* Pillar → spokes list (this issue is the hub) */}
        {spokes.length > 0 ? (
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--tm-border-soft)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
              More from this week
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {spokes.map((s) => (
                <li key={s.slug}>
                  <Link href={`/newsletter/${s.slug}`} style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", textDecoration: "none" }}>
                    {s.title} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* FAQ (FAQPage source) */}
        {issue.faqs?.length ? <NewsletterFAQ items={issue.faqs} /> : null}

        {/* ── CTA DIVIDER — end of value zone, start of product ── */}
        <div className="nl-callout" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, marginTop: 56 }}>
          <p className="nl-callout-title" style={{ margin: 0 }}>
            Upload a CV to check your Myro Score
          </p>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <Link
              href={`/cv-preview?utm_source=newsletter&utm_campaign=${encodeURIComponent(issue.slug)}`}
              className="nl-pill"
            >
              Get my free Myro Score →
            </Link>
            <ShareButton url={canonicalUrl} title={issue.title} />
          </div>
        </div>

        {/* ── BELOW THE LINE — product explainer, the only place Myro pitches ── */}
        <HowMyroWorks />

        </article>
        </div>

        <NewsletterRail
          issues={moreIssues}
          clusters={clusters}
          listTitle="More issues"
          campaign={issue.slug}
        />
       </div>
      </div>
    </>
  )
}
