import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MDXRemote } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import { getAllIssues, getIssueBySlug, getRelatedIssues, getSpokesOf } from "@/lib/newsletter"
import { NewsletterCTA } from "@/components/newsletter/issue-cta"
import { NewsletterFAQ } from "@/components/newsletter/newsletter-faq"
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
  if (!issue) return {}
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

  const moreIssues = await getRelatedIssues(issue, 3)
  const spokes = await getSpokesOf(issue.slug)
  const pillar = issue.sourceIssue ? await getIssueBySlug(issue.sourceIssue) : null

  const canonicalUrl = `${BASE}/newsletter/${issue.slug}`
  const date = new Date(issue.publishedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })
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

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 32px 96px" }}>
       <div className="nl-grid">
        <div style={{ minWidth: 0 }}>

        {/* Back link sits above the reading sheet */}
        <NewsletterBackLink />

        <article className="nl-article">

        {/* Issue tag */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
            color: "var(--tm-interactive)", background: "var(--tm-int-bg-wash)",
            border: "1px solid var(--tm-int-border)", padding: "3px 10px", borderRadius: "var(--tm-radius-pill)",
          }}>
            {themeLabel(issue.theme)}
          </span>
          <time dateTime={issue.publishedAt} style={{ fontSize: 13, color: "var(--tm-text-faint)", letterSpacing: "0.02em" }}>
            {date}
          </time>
        </div>

        {/* Headline + standfirst — serif publication voice */}
        <h1 className="nl-headline">{issue.title}</h1>
        <p className="nl-standfirst">{issue.summary}</p>

        {/* Byline */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
          padding: "16px 0", borderTop: "1px solid var(--tm-border-soft)", borderBottom: "1px solid var(--tm-border-soft)", marginBottom: 48,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div aria-hidden="true" style={{
              width: 36, height: 36, borderRadius: "50%", background: "var(--tm-int-bg-wash)",
              border: "1px solid var(--tm-int-border)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 600, color: "var(--tm-interactive)", flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)" }}>{authorName}</div>
              <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginTop: 2 }}>
                Issue {issueNum} · {series} · {mins}-minute read
              </div>
            </div>
          </div>
          <ShareButton url={canonicalUrl} title={issue.title} />
        </div>

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
              href={`/signup?utm_source=newsletter&utm_campaign=${issue.slug}`}
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

        <aside className="nl-rail" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ padding: 20, borderRadius: "var(--tm-radius-lg)", background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", boxShadow: "var(--tm-shadow-1)" }}>
            <div style={{ fontSize: 11, color: "var(--tm-interactive)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
              Get it weekly
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginTop: 6, letterSpacing: "var(--tm-tracking-tight)" }}>
              Hiring intel in your inbox
            </div>
            <p style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.55, margin: "6px 0 16px" }}>
              Skill-demand data from thousands of live postings. Every week. No fluff.
            </p>
            <EmailSubscribe compact />
          </div>

          {moreIssues.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
                More issues
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {moreIssues.map((m) => (
                  <Link
                    key={m.slug}
                    href={`/newsletter/${m.slug}`}
                    style={{ display: "block", textDecoration: "none", padding: "10px 0", borderTop: "1px solid var(--tm-border-soft)" }}
                  >
                    <div style={{ fontSize: 10, color: "var(--tm-interactive)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4, fontWeight: 500 }}>
                      {themeLabel(m.theme)}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.35 }}>
                      {m.title}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
       </div>
      </div>
    </>
  )
}
