/**
 * Section order for a Company CV Thread projection.
 *
 * Identity (name/contact) is pinned. Every other block can move. Sheet and
 * download follow this list. The living master's outline does not change.
 */

export const SECTION_KEYS = [
  "summary",
  "experience",
  "projects",
  "skills_line",
  "education",
  "certs",
] as const

export type SectionKey = (typeof SECTION_KEYS)[number]

export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value)
}

export function normalizeSectionOrder(order: readonly string[] | null | undefined): SectionKey[] {
  const seen: SectionKey[] = []
  for (const key of order ?? []) {
    if (isSectionKey(key) && !seen.includes(key)) seen.push(key)
  }
  for (const key of SECTION_KEYS) {
    if (!seen.includes(key)) seen.push(key)
  }
  return seen
}

export function moveSection(order: readonly SectionKey[], from: number, to: number): SectionKey[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) {
    return [...order]
  }
  const next = [...order]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return [...order]
  next.splice(to, 0, moved)
  return next
}
