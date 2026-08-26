/**
 * OffenderText — the CV line with its offending phrase underlined in place.
 *
 * Handoff §3, col 2: "the bullet, plus an inline offender underline on the
 * offending phrase". This replaces the old issue-chip disclosure, where the
 * user had to expand a row to learn WHICH words were the problem — and the
 * chips named the phrase in lower case, detached from the sentence it was in.
 *
 * The mark is an inset box-shadow, not text-decoration: it survives a line wrap
 * without touching the glyphs, and it reads the row's own --cvw-sev, so the
 * underline is always the colour of the thing that flagged it.
 *
 * Matching is case-insensitive but rendering is verbatim — the checks store
 * offenders lower-cased (buzzword vocabulary, trigrams, weak openers) and the CV
 * line must never be re-cased to make a highlight land.
 */
import { Fragment, type ReactNode } from "react"

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function markOffenders(
  text: string,
  offenders: readonly string[],
  /** The open fix's phrases. When a fix is open the line can be carrying marks
   *  from a DIFFERENT finding, and reading a brief about a missing number while
   *  an unrelated phrase is underlined is its own small lie. */
  active?: readonly string[],
): ReactNode {
  const phrases = Array.from(new Set(offenders.map(o => o.trim()).filter(Boolean)))
    // Longest first, so "cross functional teams" wins over "teams" and the
    // shorter match never eats the head of the longer one.
    .sort((a, b) => b.length - a.length)
  if (phrases.length === 0) return text

  const re = new RegExp(`(${phrases.map(escapeRegex).join("|")})`, "gi")
  const parts = text.split(re)
  if (parts.length === 1) return text

  const lower = new Set(phrases.map(p => p.toLowerCase()))
  const hot = new Set((active ?? []).map(p => p.toLowerCase()))
  return parts.map((part, i) => {
    const key = part.toLowerCase()
    if (!lower.has(key)) return <Fragment key={i}>{part}</Fragment>
    const on = hot.size > 0 && hot.has(key)
    return <mark key={i} className={`cvw-off${on ? " is-active" : ""}`}>{part}</mark>
  })
}
