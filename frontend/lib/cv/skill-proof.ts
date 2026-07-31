/**
 * skill-proof — how strongly did the CV actually prove a skill?
 *
 * Every extracted skill carries `evidence_text`: the slice of CV the extractor
 * leaned on. That slice is NOT uniformly a receipt. Measured on prod (2026-07-31,
 * 3,461 published `user_skills`): 16% of rows carry evidence that is nothing but
 * the skill's own name — "Data Science" proving Data Science. One user had 18 of
 * 20 like that. Rendering those as quote cards is the platform claiming proof it
 * does not hold, which is the one thing a scoring product cannot do.
 *
 * Three honest tiers, mirroring how the CV itself speaks:
 *
 *   proven  — a real line of work. "Edited 20+ advertisement and brand promotion
 *             videos". The receipt exists; show it.
 *   listed  — the skill appears in a keyword/tools line. "Tools: Git, VS Code".
 *             Real CV text, but it evidences naming, not doing.
 *   none    — the evidence says nothing the skill name didn't already say, or is
 *             absent. Keyword-inferred. Admit it.
 *
 * The extractor already knows this (`signal_type`: mention | project | impact |
 * leadership, where "mention" is defined as *named in a skills list only, no
 * evidence of use*), but that field is collapsed into `matched_level` and never
 * stored on `user_skills`. Deriving the tier from the evidence text instead means
 * one rule covers every row ever written — no migration, no backfill, and no
 * split between users who uploaded before and after this shipped.
 *
 * Bias: when torn between `listed` and `proven`, return `listed`. Understating
 * our own confidence is honest; overstating it is the bug this file exists to
 * kill. `none` is the only tier decided by an exact rule, because it is the one
 * that must never be wrong.
 *
 * Pure. No IO. Shared by the onboarding confirm step and the CV Skills rail so
 * both surfaces can never disagree about what a skill is worth.
 */

export type ProofTier = "proven" | "listed" | "none"

/** Words that carry no evidentiary weight when measuring what's left of a phrase. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "with",
  "by", "from", "as", "is", "was", "were", "be", "been", "am", "are", "it",
  "its", "this", "that", "these", "those", "my", "our", "their", "his", "her",
  "using", "via", "per", "into", "over", "under", "than", "then", "also",
])

/**
 * Verbs that describe doing the work. Deliberately narrow and past/active —
 * a short high-precision list beats a long fuzzy one, because a false "proven"
 * is the failure mode we care about. Weak claims ("used", "familiar with",
 * "knowledge of") are excluded on purpose: they name exposure, not output.
 */
const ACTION_VERBS = new Set([
  "achieved", "analysed", "analyzed", "architected", "automated", "built",
  "completed", "conducted", "coordinated", "created", "creates", "cut",
  "delivered", "designed", "designing", "developed", "drove", "edited",
  "engineered", "executed", "expanded", "generated", "grew", "handled",
  "headed", "implemented", "improved", "increased", "launched", "led",
  "leveraged", "managed", "mentored", "migrated", "negotiated", "onboarded",
  "optimised", "optimized", "orchestrated", "oversaw", "owned", "performed",
  "presented", "produced", "promoted", "published", "ran", "reduced",
  "researched", "scaled", "shipped", "shot", "spearheaded", "streamlined",
  "supported", "trained", "transformed", "won", "wrote",
])

/** Label prefix of a keyword line: "Tools:", "SOFT SKILLS:", "Programming:". */
const LABEL_PREFIX = /^[a-z][a-z /&+-]{1,28}:/i

/**
 * Phrases where the CV names a skill while explicitly NOT claiming work done —
 * enumeration ("listed in Soft Skills") or aspiration ("a keen interest in").
 * These read like prose and would otherwise sail past every structural check,
 * which is exactly how "Passionate B.Tech student with a keen interest in social
 * media marketing" was scoring as proof of Social Media Marketing on prod.
 */
const CLAIM_MARKERS =
  /\b(listed (in|under)|mentioned in|interest(ed)? in|passionate about|familiar with|exposure to|knowledge of|proficient in|skilled in|learning|mastering|coursework|aspiring)\b/i

/** Lowercase, strip punctuation, collapse whitespace. Parenthetical taxonomy
 *  qualifiers ("Python (Programming Language)") are dropped — they are our
 *  vocabulary, never the candidate's. */
function normalize(text: string): string {
  return text
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
}

function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean)
}

/** Meaningful words in `evidence` that the skill name did not already supply. */
function residualWords(evidence: string, skillName: string): string[] {
  const own = new Set(words(skillName))
  return words(evidence).filter(
    (w) => !own.has(w) && !STOPWORDS.has(w) && !/^\d+$/.test(w) && w.length > 1,
  )
}

function hasActionVerb(evidence: string): boolean {
  return words(evidence).some((w) => ACTION_VERBS.has(w))
}

/**
 * True when the phrase opens on an action verb — the shape of a CV bullet.
 *
 * This is the single highest-precision proof signal available without parsing:
 * achievement lines start with the verb ("Created user manuals, training guides,
 * and process documentation"), keyword lines start with a noun or a label
 * ("Tools: Git, VS Code"). It has to be checked before the comma heuristics,
 * because a rich bullet naturally contains commas and was otherwise being
 * demoted to `listed` on prod.
 */
function opensOnAction(evidence: string): boolean {
  const [first] = words(evidence)
  return Boolean(first && ACTION_VERBS.has(first))
}

/**
 * True when the phrase reads as an enumeration rather than a sentence.
 *
 * A label prefix or an embedded section break is structural — those are the CV's
 * own layout telling us this is a list. Commas are weaker: "Analysed supply
 * chain, production workflow" is a work line that happens to contain one. So the
 * comma signal only counts when no action verb is present.
 */
function looksEnumerated(evidence: string): boolean {
  if (LABEL_PREFIX.test(evidence.trim())) return true
  if (evidence.includes("\n")) return true
  const separators = (evidence.match(/[,|·•/&]/g) ?? []).length
  if (separators >= 2) return true
  return separators >= 1 && words(evidence).length <= 5 && !hasActionVerb(evidence)
}

/** True when `evidence` is a slice of the CV's own skills paragraph. */
function fromSkillsLine(evidence: string, skillsLine: string | null | undefined): boolean {
  const line = normalize(skillsLine ?? "")
  const ev = normalize(evidence)
  return line.length > 0 && ev.length > 0 && line.includes(ev)
}

/**
 * Classify one skill's evidence.
 *
 * @param evidence   `user_skills.evidence_text` — the extractor's receipt.
 * @param skillName  Display name, so an echo of it can be recognised.
 * @param skillsLine The CV's own skills paragraph when the caller holds it
 *                   (the playground does). Turns the listed/proven call from a
 *                   heuristic into an exact provenance check where present.
 */
export function proofTier(
  evidence: string | null | undefined,
  skillName: string,
  skillsLine?: string | null,
): ProofTier {
  const text = (evidence ?? "").trim()
  if (!text) return "none"

  // Known provenance outranks inference. When the caller holds the CV's skills
  // paragraph and the evidence came out of it, we know exactly what this is —
  // even for a bare echo, "it's in your skills line" beats "no proof at all".
  if (fromSkillsLine(text, skillsLine)) return "listed"

  const residual = residualWords(text, skillName)

  // Says nothing the skill name didn't. Exact rule — this tier must never lie.
  if (residual.length === 0) return "none"

  // The CV itself says this is a mention or an ambition, not work done. Believe it.
  if (CLAIM_MARKERS.test(text)) return residual.length <= 1 ? "none" : "listed"

  // A bullet's opening verb outranks the punctuation heuristics below.
  if (opensOnAction(text)) return "proven"

  if (looksEnumerated(text)) return "listed"

  // A single leftover word is a qualifier ("Python (Learning)", "Tally ERP 9"),
  // not a claim about work done.
  if (residual.length === 1) return "none"

  if (hasActionVerb(text)) return "proven"

  // No verb: only a phrase with real substance left counts as description.
  return residual.length >= 3 ? "proven" : "listed"
}

export interface ProofCounts {
  proven: number
  listed: number
  none: number
}

export function countProof<T>(
  items: T[],
  read: (item: T) => { evidence: string | null | undefined; name: string },
  skillsLine?: string | null,
): ProofCounts {
  const counts: ProofCounts = { proven: 0, listed: 0, none: 0 }
  for (const item of items) {
    const { evidence, name } = read(item)
    counts[proofTier(evidence, name, skillsLine)] += 1
  }
  return counts
}

/** Rail copy. One place, so onboarding and the playground read identically. */
export const PROOF_TIER_COPY: Record<ProofTier, { label: string; note: string }> = {
  proven: {
    label: "Proven in your CV",
    note: "A line of your work backs each of these.",
  },
  listed: {
    label: "Listed, not shown",
    note: "Named in your CV, but no line shows you doing it. Add one to prove it.",
  },
  none: {
    label: "No proof yet",
    note: "Found by keyword — your CV never shows this being used.",
  },
}
