/**
 * Job-title display guard.
 *
 * Scraped listings leak non-titles into the title field, and they surface on
 * the most trust-sensitive screens we have — the CV workspace and Prep rooms.
 * Observed live on 2026-07-26:
 *
 *   "Cognizant"                       (company name repeated as the role)
 *   "Apply now about Security Clearance Jobs"   (call-to-action copy)
 *   "Accelerate Your Hiring Process"  (employer marketing strapline)
 *   "Job ID: 12345"                   (an identifier)
 *
 * The Railway logs corroborate it from the other side — `/companies/Job%20ID%3A…`
 * and `/companies/Accelerate%20Your%20Hiring%20Process` are real requests, so
 * these strings are stored as company names too.
 *
 * This is a DISPLAY guard, deliberately: it is honest about not knowing rather
 * than inventing a title, and it never mutates stored data. The real fix is in
 * the `firecrawl_Supabase` extractor; until that lands and back-fills, showing
 * a user their saved job as "Cognizant · Cognizant" reads as a broken product.
 *
 * Conservative by design — a false positive HIDES a real title, which is worse
 * than showing a slightly odd one. Only high-confidence junk is caught.
 *
 * Relationship to `lib/text/strip-markdown.ts#cleanJobTitle`: that one fixes
 * FORMATTING ("Consulting\ \ ### Project Manager" → "Consulting · Project
 * Manager"). This one judges MEANING. They compose rather than compete —
 * `displayJobTitle` runs the formatter first, then the semantic guard, and is
 * the single entry point every job-title render should use.
 */
import { cleanJobTitle as stripTitleMarkup } from "@/lib/text/strip-markdown"

/** Rendered when a title is junk. Callers show the company alongside it. */
export const TITLE_UNAVAILABLE = "Role title unavailable"

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/** Whole-string patterns that are never a job title. */
const JUNK_PATTERNS: RegExp[] = [
  /^job\s*id\b/i,                    // "Job ID: 4419341255"
  /^apply\s+now\b/i,                 // "Apply now about Security Clearance Jobs"
  /^click\s+here\b/i,
  /^(view|see|browse|search)\s+(all\s+)?jobs?\b/i,
  /^accelerate\s+your\s+hiring\b/i,  // employer marketing strapline
  /^(we|were|we're)\s+hiring\b/i,
  /^join\s+(our|the)\s+team\b/i,
  /^careers?\s+at\b/i,
  /^\d+\s*\+?\s*(open\s+)?(roles?|jobs?|positions?|vacancies)\b/i,
  /^(current|latest|new)\s+(openings?|vacancies|jobs?)\b/i,
]

/** Scraper debris that survives into the title — markdown, key:value runs. */
const STRUCTURAL_JUNK = [
  /#{2,}/,                                     // "Consulting  ### Location:India"
  /\b(location|employment type|job type)\s*:/i,
]

export function isJunkTitle(title: string | null | undefined, company?: string | null): boolean {
  if (!title) return true
  const t = title.trim()
  if (t.length < 2) return true

  // A title that is just the company name carries no information.
  if (company && norm(t) === norm(company) && norm(t).length > 0) return true

  if (JUNK_PATTERNS.some(re => re.test(t))) return true
  if (STRUCTURAL_JUNK.some(re => re.test(t))) return true

  // All-digits, or a bare identifier.
  if (/^[\d\s\-_.#]+$/.test(t)) return true

  return false
}

/**
 * THE entry point for rendering a job title. Strips scraper markup, then
 * judges whether what remains is actually a title. Returns TITLE_UNAVAILABLE
 * for junk so the surface stays honest; callers should keep showing the
 * company, which is usually the trustworthy half of a bad row.
 */
export function displayJobTitle(
  title: string | null | undefined,
  company?: string | null,
): string {
  const formatted = stripTitleMarkup(title)
  if (isJunkTitle(formatted, company)) return TITLE_UNAVAILABLE
  return formatted
}
