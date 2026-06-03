/**
 * Keyword highlight helpers — used by LivePreview and bullet meta chips.
 * Targets refer to the JD/required skills the user is tailoring against.
 */
import { Fragment, type ReactNode } from "react"
import type { SkillGapItem } from "@/lib/api"

export interface KeywordTarget {
  kw: string
  weight?: number
  matched?: boolean
}

const CHIP_LOWER_WORDS = new Set(["and", "or", "of", "for", "to", "in", "with", "on", "at"])

export function targetsFromSkillGap(items: SkillGapItem[]): KeywordTarget[] {
  return items
    .filter(s => s.skill && s.skill.length > 1)
    .map(s => ({
      kw: s.skill,
      weight: s.is_primary ? 3 : 2,
      matched: !s.missing,
    }))
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Word-boundary aware match: short keywords (≤3 chars like "R", "Go", "AI")
// use \b guards to avoid false positives ("R" inside "React", "Go" inside "Google").
function kwMatches(text: string, kw: string): boolean {
  if (kw.length <= 3) {
    return new RegExp(`\\b${escapeRegex(kw)}\\b`, "i").test(text)
  }
  return text.toLowerCase().includes(kw.toLowerCase())
}

export function highlightKeywords(text: string, keywords: KeywordTarget[] | undefined): ReactNode {
  if (!keywords || keywords.length === 0) return text
  // Sort longest first so multi-word phrases beat their component words.
  const sorted = [...keywords].sort((a, b) => b.kw.length - a.kw.length)
  let parts: Array<{ type: "text" | "hit"; v: string }> = [{ type: "text", v: text }]

  for (const { kw } of sorted) {
    if (!kw) continue
    const isShort = kw.length <= 3
    const next: typeof parts = []

    for (const part of parts) {
      if (part.type !== "text") { next.push(part); continue }

      if (isShort) {
        // Use regex split to find word-boundary matches
        const re = new RegExp(`(\\b${escapeRegex(kw)}\\b)`, "gi")
        let cursor = 0
        let m: RegExpExecArray | null
        // eslint-disable-next-line no-cond-assign
        while ((m = re.exec(part.v)) !== null) {
          if (m.index > cursor) next.push({ type: "text", v: part.v.slice(cursor, m.index) })
          next.push({ type: "hit", v: m[0] })
          cursor = m.index + m[0].length
        }
        if (cursor < part.v.length) next.push({ type: "text", v: part.v.slice(cursor) })
      } else {
        const lower = part.v.toLowerCase()
        const needle = kw.toLowerCase()
        let cursor = 0
        while (cursor < part.v.length) {
          const idx = lower.indexOf(needle, cursor)
          if (idx < 0) { next.push({ type: "text", v: part.v.slice(cursor) }); break }
          if (idx > cursor) next.push({ type: "text", v: part.v.slice(cursor, idx) })
          next.push({ type: "hit", v: part.v.slice(idx, idx + kw.length) })
          cursor = idx + kw.length
        }
      }
    }
    parts = next
  }

  return parts.map((p, i) =>
    p.type === "hit"
      ? <mark key={i} className="cvb-kw">{p.v}</mark>
      : <Fragment key={i}>{p.v}</Fragment>,
  )
}

export function bulletKeywordHits(text: string, targets: KeywordTarget[]): KeywordTarget[] {
  return targets.filter(t => kwMatches(text, t.kw))
}

export function resolvePlaygroundCompany(
  jobCompany: string | null | undefined,
  gapCompany: string | null | undefined,
): string {
  return jobCompany?.trim() || gapCompany?.trim() || "Untitled company"
}

export function formatKeywordChipLabel(label: string): string {
  return label
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && CHIP_LOWER_WORDS.has(word.toLowerCase())) return word.toLowerCase()
      return word
    })
    .join(" ")
}
