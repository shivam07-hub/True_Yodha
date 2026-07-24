/**
 * Bullet -> story provenance matching for the CV workspace provenance rail.
 *
 * A Master CV bullet is, by construction, the story's `pointer` verbatim
 * (career_projection writes it that way — see project_career_story_reservoir).
 * A tailored CVVersion's bullet may since have been edited/molded, so it no
 * longer matches any pointer exactly — that's expected, not a bug.
 *
 * Pure functions only; no fabrication — a bullet with no exact pointer match
 * simply has no matched story (never invented).
 */
import type { CareerProfile, CareerProfileRole, CareerStory } from "@/lib/api"

export interface MatchedStory {
  story: CareerStory
  role: CareerProfileRole | null
}

/** Exact pointer text -> story (+ owning role), across every role and highlight. */
export function buildPointerIndex(profile: CareerProfile | undefined | null): Map<string, MatchedStory> {
  const index = new Map<string, MatchedStory>()
  if (!profile) return index
  for (const role of profile.roles) {
    for (const story of role.stories) {
      const key = story.pointer.trim()
      if (key) index.set(key, { story, role })
    }
  }
  for (const story of profile.highlights) {
    const key = story.pointer.trim()
    if (key && !index.has(key)) index.set(key, { story, role: null })
  }
  return index
}

/** Words from `terms` that literally occur in `text` (case-insensitive, whole
 *  token) — the real overlap between a bullet and the job's matched skills.
 *  Never invents a "matched term" that isn't actually present in the line. */
export function matchedTerms(text: string, terms: string[] | undefined | null): string[] {
  if (!terms || terms.length === 0) return []
  const hay = text.toLowerCase()
  const seen = new Set<string>()
  const out: string[] = []
  for (const term of terms) {
    const needle = term.trim().toLowerCase()
    if (!needle || seen.has(needle)) continue
    if (hay.includes(needle)) {
      seen.add(needle)
      out.push(term)
    }
  }
  return out.slice(0, 6)
}
