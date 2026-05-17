import fs from "fs"
import path from "path"
import matter from "gray-matter"

export type IssueTheme = "heatmap" | "skill" | "trajectory" | "boom-watch" | "future-of-work"
export type IssuePillar = "ai-careers" | "career-trajectories" | "career-switching" | "in-demand-skills"

export interface IssueFrontmatter {
  title: string
  seoTitle?: string
  slug: string
  publishedAt: string
  theme: IssueTheme
  primaryKeyword: string
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
