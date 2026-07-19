import fs from "fs"
import path from "path"
import matter from "gray-matter"

export type IssueTheme = "heatmap" | "skill" | "trajectory" | "boom-watch" | "future-of-work"
export type IssuePillar = "ai-careers" | "career-trajectories" | "career-switching" | "in-demand-skills"

/** One FAQ pair. Feeds both the visible accordion and FAQPage JSON-LD. */
export interface IssueFaq {
  q: string
  a: string
}

/** A HowTo step. Feeds the visible ladder and HowTo JSON-LD (trajectory issues). */
export interface IssueStep {
  name: string
  text: string
}

/**
 * Aggregate dataset descriptor. Presence-gated: when set, the issue emits
 * Dataset JSON-LD + a build-time CSV at /newsletter/{slug}/dataset.csv.
 * Aggregates only (never raw rows) — licensed CC BY 4.0 for citation backlinks.
 */
export interface IssueDataset {
  name: string
  description: string
  spatialCoverage?: string
  /** ISO 8601 interval or month, e.g. "2026-06". */
  temporalCoverage?: string
  variableMeasured?: string[]
  /** CSV header row. */
  columns: string[]
  /** CSV body rows, column-aligned with `columns`. */
  table: (string | number)[][]
}

/**
 * One headline figure for the above-the-fold key-numbers strip.
 * Authored in frontmatter — never derived from the article body. A data
 * newsletter must lead with data, but only figures the author has verified.
 */
export interface IssueKeyStat {
  value: string
  label: string
}

export interface IssueFrontmatter {
  title: string
  seoTitle?: string
  slug: string
  publishedAt: string
  theme: IssueTheme
  primaryKeyword: string
  secondaryKeywords?: string[]
  ctaRole: string
  ogImage?: string
  ogImageAlt?: string
  summary: string
  pillar?: IssuePillar
  issueNumber?: number
  seriesLabel?: string
  readMinutes?: number
  authorName?: string
  authorInitials?: string
  /** Slug of the pillar heatmap this spoke is built on (hub-and-spoke cluster). */
  sourceIssue?: string
  faqs?: IssueFaq[]
  steps?: IssueStep[]
  dataset?: IssueDataset
  /** 2–4 headline figures rendered directly under the standfirst. */
  keyStats?: IssueKeyStat[]
}

export interface Issue extends IssueFrontmatter {
  content: string
}

const ISSUES_DIR = path.join(process.cwd(), "content", "newsletter", "issues")

function readIssueFile(filename: string): Issue | null {
  try {
    const raw = fs.readFileSync(path.join(ISSUES_DIR, filename), "utf-8")
    const { data, content } = matter(raw)
    const fm = data as IssueFrontmatter
    if (!fm.title || !fm.slug || !fm.publishedAt) return null
    return { ...fm, content }
  } catch {
    return null
  }
}

export async function getAllIssues(): Promise<Issue[]> {
  if (!fs.existsSync(ISSUES_DIR)) return []
  const files = fs.readdirSync(ISSUES_DIR).filter((f) => f.endsWith(".mdx"))
  const issues = files.map(readIssueFile).filter((i): i is Issue => i !== null)
  return issues.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export async function getIssueBySlug(slug: string): Promise<Issue | null> {
  const filename = `${slug}.mdx`
  return readIssueFile(filename)
}

/** Spoke issues that declare this slug as their `sourceIssue` (pillar → spokes). */
export async function getSpokesOf(slug: string): Promise<Issue[]> {
  const all = await getAllIssues()
  return all.filter((i) => i.sourceIssue === slug)
}

/**
 * Topic-cluster related issues for the rail. Prefers same pillar, then the
 * pillar this issue points at (or its spokes), then recency as a backstop.
 */
export async function getRelatedIssues(issue: Issue, limit = 3): Promise<Issue[]> {
  const all = (await getAllIssues()).filter(
    (i) => i.slug !== issue.slug && i.slug !== "_placeholder",
  )
  const score = (i: Issue): number => {
    if (issue.pillar && i.pillar === issue.pillar) return 3
    if (issue.sourceIssue && (i.slug === issue.sourceIssue || i.sourceIssue === issue.sourceIssue)) return 2
    if (i.sourceIssue === issue.slug) return 2
    return 0
  }
  return [...all]
    .sort((a, b) => score(b) - score(a) || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit)
}

/** Serialize a dataset table to CSV (RFC 4180 quoting). */
export function datasetToCsv(dataset: IssueDataset): string {
  const esc = (v: string | number): string => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = [dataset.columns, ...dataset.table]
  return rows.map((row) => row.map(esc).join(",")).join("\r\n") + "\r\n"
}
