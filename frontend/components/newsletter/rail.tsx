/**
 * Shared newsletter rail — the one rail both /newsletter and /newsletter/[slug]
 * render.
 *
 * Rail parity law (docs/NEWSLETTER_LAYOUT_LAWS.md): a reserved sidebar column
 * must carry enough content to fill its main column, or it must lose the
 * column. The issue page previously reserved 300px for a subscribe box and
 * three links beside a 4000px article — after the first scroll the right third
 * of an acquisition page was permanently empty.
 *
 * Panels are presence-gated: the live-proof panel hides entirely when the
 * stats endpoint is unreachable rather than rendering placeholder numbers,
 * and clusters hide below two themes (a one-row taxonomy is not a taxonomy).
 */

import Link from "next/link"
import { ScoreCta } from "./score-cta"
import { publicStats } from "@/lib/api"
import { LANDING_FLOORS, displayCount } from "@/lib/public-stats-display"
import { formatDate, formatCount } from "@/lib/format"
import type { Issue, IssueTheme } from "@/lib/newsletter"
import { EmailSubscribe } from "@/components/newsletter/email-subscribe"
import styles from "./rail.module.css"

const THEME_LABELS: Record<IssueTheme, string> = {
  heatmap: "Hiring heatmap",
  skill: "Skill of the week",
  trajectory: "Career trajectory",
  "boom-watch": "Boom watch",
  "future-of-work": "Future of work",
}

export interface RailCluster {
  theme: IssueTheme
  label: string
  count: number
  latestSlug: string
}

/** Group issues into topic clusters for the rail. */
export function buildClusters(issues: Issue[]): RailCluster[] {
  const clusters = new Map<IssueTheme, { count: number; latest: Issue }>()
  for (const issue of issues) {
    const current = clusters.get(issue.theme)
    if (!current) clusters.set(issue.theme, { count: 1, latest: issue })
    else current.count += 1
  }
  return Array.from(clusters.entries()).map(([theme, data]) => ({
    theme,
    label: THEME_LABELS[theme],
    count: data.count,
    latestSlug: data.latest.slug,
  }))
}

function themeLabel(theme: IssueTheme): string {
  return THEME_LABELS[theme] ?? theme
}

/* ── Subscribe ─────────────────────────────────────────────────────────── */

function SubscribePanel() {
  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>Get it weekly</p>
      <h2 className={styles.panelTitle}>Hiring intel in your inbox</h2>
      <p className={styles.panelBody}>
        Skill-demand data from thousands of live postings. Every week. No fluff.
      </p>
      <EmailSubscribe compact />
    </section>
  )
}

/* ── Live proof ────────────────────────────────────────────────────────── */

interface ProofData {
  jobs: number
  companies: number
  asOf: string
}

/**
 * The corpus counts behind every issue. This is the rail's trust payload: a
 * data newsletter should show its data scale beside the article. Values are
 * floored through the same helper the landing page uses, so the two surfaces
 * can never quote different numbers.
 *
 * Returns null on any failure — the panel then does not render at all. We
 * never ship placeholder counts on a page whose entire claim is real data.
 */
async function loadProof(): Promise<ProofData | null> {
  try {
    const stats = await publicStats.get()
    return {
      jobs: displayCount(stats.jobs_tracked, LANDING_FLOORS.jobs, 1000),
      companies: displayCount(stats.companies_monitored, LANDING_FLOORS.companies, 10),
      asOf: stats.as_of,
    }
  } catch {
    return null
  }
}

function ProofPanel({ proof }: { proof: ProofData }) {
  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>Behind every issue</p>
      <div className={styles.proofRows}>
        <div className={styles.proofRow}>
          <span className={styles.proofLabel}>Live roles tracked</span>
          <span className={styles.proofValue}>{formatCount(proof.jobs)}+</span>
        </div>
        <div className={styles.proofRow}>
          <span className={styles.proofLabel}>Companies monitored</span>
          <span className={styles.proofValue}>{formatCount(proof.companies)}+</span>
        </div>
        <div className={styles.proofRow}>
          <span className={styles.proofLabel}>Skills mapped</span>
          <span className={styles.proofValue}>{formatCount(LANDING_FLOORS.skills)}</span>
        </div>
      </div>
      <p className={styles.proofFoot}>Updated {formatDate(proof.asOf, "long")}</p>
    </section>
  )
}

/* ── Issue list ────────────────────────────────────────────────────────── */

function IssueListPanel({ issues, title }: { issues: Issue[]; title: string }) {
  return (
    <section className={styles.panelQuiet}>
      <p className={`${styles.kicker} ${styles.kickerMuted}`}>{title}</p>
      <div className={styles.list}>
        {issues.map((issue) => (
          <Link key={issue.slug} href={`/newsletter/${issue.slug}`} className={styles.item}>
            <div className={styles.itemMeta}>
              <span>{themeLabel(issue.theme)}</span>
              <span className={styles.itemDate}>{formatDate(issue.publishedAt, "medium")}</span>
            </div>
            <div className={styles.itemTitle}>{issue.title}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ── Clusters ──────────────────────────────────────────────────────────── */

function ClusterPanel({ clusters }: { clusters: RailCluster[] }) {
  return (
    <section className={styles.panelQuiet}>
      <p className={`${styles.kicker} ${styles.kickerMuted}`}>Topic clusters</p>
      <div className={styles.list}>
        {clusters.map((cluster) => (
          <Link
            key={cluster.theme}
            href={`/newsletter/${cluster.latestSlug}`}
            className={styles.cluster}
          >
            <span>{cluster.label}</span>
            <strong className={styles.clusterCount}>{cluster.count}</strong>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ── Score CTA ─────────────────────────────────────────────────────────── */

function ScorePanel({ campaign }: { campaign: string }) {
  return (
    <section className={styles.ctaPanel}>
      <p className={styles.kicker}>Your turn</p>
      <h2 className={styles.panelTitle}>See where your CV stands</h2>
      <ScoreCta campaign={campaign} linkClassName={styles.ctaLink} bodyClassName={styles.panelBody} />
    </section>
  )
}

/* ── The rail ──────────────────────────────────────────────────────────── */

/**
 * Deliberately NOT sticky. Sticky was a crutch for a rail too thin to fill its
 * column; a rail that now carries proof, issues, clusters and a CTA can exceed
 * the viewport, and a sticky element taller than the viewport hides its own
 * bottom. It scrolls with the article like a real second column.
 */
export async function NewsletterRail({
  issues,
  clusters,
  listTitle,
  campaign,
}: {
  /** Issues to list in the rail. Already filtered by the caller. */
  issues: Issue[]
  clusters: RailCluster[]
  listTitle: string
  /** utm_campaign for the score CTA — the issue slug, or "index". */
  campaign: string
}) {
  const proof = await loadProof()

  return (
    <aside className={styles.rail} aria-label="Newsletter briefing">
      <SubscribePanel />
      {proof && <ProofPanel proof={proof} />}
      {issues.length > 0 && <IssueListPanel issues={issues} title={listTitle} />}
      {clusters.length > 1 && <ClusterPanel clusters={clusters} />}
      <ScorePanel campaign={campaign} />
    </aside>
  )
}
