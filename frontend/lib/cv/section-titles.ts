/**
 * CV section headings — the person's own names for their sections.
 *
 * Opt-in: an absent key is the default heading. Stored on the profile
 * (`cv_section_titles`), so a heading renamed once reads the same on the master
 * and on every tailored CV, on screen, in the PDF and in the DOCX.
 * Mirrors `backend/app/services/cv_section_order.py`: the server normalises
 * with the same rules, this copy only lets the editor answer before the
 * round trip.
 */
import type { SectionKey } from "@/lib/cv/section-order"

export type SectionTitles = Partial<Record<SectionKey, string>>

export const DEFAULT_SECTION_TITLES: Record<SectionKey, string> = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  skills_line: "Skills",
  education: "Education",
  certs: "Certifications",
}

/** Long enough for "Projects and Agentic Pursuits"; one line on a 375px sheet. */
export const MAX_SECTION_TITLE = 40

export function sectionTitle(key: SectionKey, titles?: SectionTitles | null): string {
  return titles?.[key] || DEFAULT_SECTION_TITLES[key]
}

/** Whitespace collapsed, capped; empty or equal to the default means "not renamed". */
export function cleanSectionTitle(key: SectionKey, raw: string): string | null {
  const text = raw.split(/\s+/).filter(Boolean).join(" ").slice(0, MAX_SECTION_TITLE).trim()
  if (!text || text.toLowerCase() === DEFAULT_SECTION_TITLES[key].toLowerCase()) return null
  return text
}

/** The map after renaming one section; `null` removes the override. */
export function withSectionTitle(
  titles: SectionTitles | null | undefined,
  key: SectionKey,
  raw: string,
): SectionTitles {
  const next: SectionTitles = { ...(titles ?? {}) }
  const clean = cleanSectionTitle(key, raw)
  if (clean) next[key] = clean
  else delete next[key]
  return next
}
