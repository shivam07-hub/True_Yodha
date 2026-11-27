import type { CVStructured } from "@/lib/api"
import { runContentChecks, type ContentBulletRef } from "@/components/cv/builder/content-checks"

const SECTION_ORDER: Record<ContentBulletRef["section"], number> = { summary: 0, experience: 1, projects: 2, skills: 3 }

function lineText(cv: CVStructured, ref: ContentBulletRef): string {
  if (ref.section === "summary") return cv.summary ?? ""
  if (ref.section === "skills") return cv.skills_line ?? ""
  return cv[ref.section][ref.itemIndex]?.bullets[ref.bulletIndex] ?? ""
}

/** The first line, as the CV reads, that the playground would rewrite, and how
 *  many other lines it flags. One line with three findings is one line. */
export function flaggedLines(cv: CVStructured): { first: string; more: number } | null {
  const lines = new Map<string, ContentBulletRef>()
  for (const finding of runContentChecks(cv)) {
    lines.set(`${finding.section}:${finding.itemIndex}:${finding.bulletIndex}`, finding)
  }
  const [first] = [...lines.values()].sort(
    (a, b) =>
      SECTION_ORDER[a.section] - SECTION_ORDER[b.section] || a.itemIndex - b.itemIndex || a.bulletIndex - b.bulletIndex,
  )
  const text = first ? lineText(cv, first) : ""
  return text ? { first: text, more: lines.size - 1 } : null
}
