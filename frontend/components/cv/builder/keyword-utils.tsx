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

export function targetsFromSkillGap(items: SkillGapItem[]): KeywordTarget[] {
  return items
    .filter(s => s.skill && s.skill.length > 1)
    .map(s => ({
      kw: s.skill,
      weight: s.is_primary ? 3 : 2,
      matched: !s.missing,
    }))
}

export function highlightKeywords(text: string, keywords: KeywordTarget[] | undefined): ReactNode {
  if (!keywords || keywords.length === 0) return text
  // Sort longest first so multi-word phrases beat their component words.
  const sorted = [...keywords].sort((a, b) => b.kw.length - a.kw.length)
  let parts: Array<{ type: "text" | "hit"; v: string }> = [{ type: "text", v: text }]
  for (const { kw } of sorted) {
    if (!kw) continue
    const needle = kw.toLowerCase()
    const next: typeof parts = []
    for (const part of parts) {
      if (part.type !== "text") { next.push(part); continue }
      const lower = part.v.toLowerCase()
      let cursor = 0
      while (cursor < part.v.length) {
        const idx = lower.indexOf(needle, cursor)
        if (idx < 0) { next.push({ type: "text", v: part.v.slice(cursor) }); break }
        if (idx > cursor) next.push({ type: "text", v: part.v.slice(cursor, idx) })
        next.push({ type: "hit", v: part.v.slice(idx, idx + kw.length) })
        cursor = idx + kw.length
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
  const lower = text.toLowerCase()
  return targets.filter(t => lower.includes(t.kw.toLowerCase()))
}
