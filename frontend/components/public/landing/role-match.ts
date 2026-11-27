/**
 * Spec #66 L2b: which families the hero's search shows for what a visitor
 * types. Family names are skill domains ("Data Analysis"), and people type
 * titles ("data analyst"), so a substring filter finds nothing for the most
 * common searches. This is the word-root rule the backend already uses to read
 * a typed role against family names (`backend/app/repositories/role_families.py`,
 * `family_match_score`): the same stems, the same short forms, the same rank
 * words dropped. `role-match.test.ts` holds the two word lists equal.
 *
 * One difference, on purpose: the backend picks one family for a title, so a
 * seat word ("engineer") never matches alone there. Here a person picks from a
 * list as they type, so "engineer" lists the engineering families.
 */

/** Words that say how senior a role is, not what it is, and the filler
 *  between field words. Dropped from what is typed and from family names. */
export const RANK_WORDS: ReadonlySet<string> = new Set([
  "senior", "sr", "junior", "jr", "lead", "principal", "associate", "head",
  "intern", "trainee", "staff", "chief", "assistant", "deputy", "i", "ii",
  "iii", "of", "and", "the", "in", "for", "a", "an", "role", "roles", "job",
  "jobs",
])

/** Short forms people type for the fields the taxonomy spells out. */
export const ALIASES: Readonly<Record<string, string>> = {
  hr: "human resources",
  ml: "machine learning",
  ai: "artificial intelligence",
  qa: "quality assurance",
  sde: "software development",
  swe: "software",
  pm: "product management",
  ui: "design",
  ux: "design",
  devops: "cloud computing",
  fintech: "financial",
}

/** A family reads as people say it: "Artificial Intelligence and Machine
 *  Learning (AI/ML)" → "AI/ML". Chips, search results and every label of the
 *  pick share it. */
export function roleLabel(family: string): string {
  const short = family.match(/\(([^)]+)\)\s*$/)
  return short ? short[1] : family
}

export const STEM = 5
/** Results the search lists at once: enough to choose from, short on a phone. */
export const SHOWN = 6

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

function commonPrefix(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1
  return i
}

/** `have` shares `want`'s root: "analyst" meets "analysis", "scientist" meets
 *  "science", a half-typed "prod" meets "product". */
function sameRoot(want: string, have: string): boolean {
  const common = commonPrefix(want, have)
  return common >= Math.min(STEM, want.length) && common * 10 >= Math.min(want.length, have.length) * 7
}

/** What the visitor asked for, one entry per word: the word itself, and the
 *  words its short form stands for. The last word is still being typed, so a
 *  rank word there ("an" on the way to "analysis") is kept. */
function wanted(query: string): { word: string; alias: string[] }[] {
  const typed = words(query)
  const finished = /\s$/.test(query)
  return typed
    .filter((word, i) => !RANK_WORDS.has(word) || (i === typed.length - 1 && !finished))
    .map((word) => ({ word, alias: words(ALIASES[word] ?? "") }))
}

/** The families matching every word typed. Those matching the words as typed
 *  come before those reached only through a short form ("ui ux" puts UI/UX
 *  Design before Web Design); otherwise the order given, busiest first. */
export function matchRoles<T extends { family: string }>(query: string, roles: readonly T[]): T[] {
  if (query.trim().length < 2) return []
  const want = wanted(query)
  if (want.length === 0) return []
  return roles
    .flatMap((role) => {
      // "and" is in 44 family names: half-typed "an" must not match it.
      const have = words(role.family).filter((word) => !RANK_WORDS.has(word))
      const hits = (word: string) => have.some((h) => sameRoot(word, h))
      const literal = want.filter(({ word }) => hits(word)).length
      const all = want.every(({ word, alias }) => hits(word) || (alias.length > 0 && alias.every(hits)))
      return all ? [{ role, literal }] : []
    })
    .sort((a, b) => b.literal - a.literal)
    .slice(0, SHOWN)
    .map(({ role }) => role)
}
