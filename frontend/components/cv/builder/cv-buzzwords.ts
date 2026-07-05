/**
 * cv-buzzwords — curated résumé cliché / buzzword dictionary.
 *
 * A build-time STATIC snapshot so the deterministic content check (`runContentChecks`)
 * has zero-latency, zero-cost data on every keystroke — the ledger that flags these
 * is the trust surface, it can never wait on an LLM or cost coins to *see*.
 *
 * PROVENANCE: seeded from the authored Myro CV playbook corpus (the same
 * `firecrawl_Supabase/Interview Prep/RAG Sources` + `playbooks/cv-playbook.md`
 * shelf that grounds the LLM rewrite, backlog #32). This list is the frozen
 * client-side mirror; the live RAG "buzzwords to avoid" source is what the
 * *rewrite* cites. Keep the two in sync when the playbook shelf gains entries —
 * do NOT invent additions here; add them to the playbook source first.
 *
 * Matching is phrase-level, case-insensitive, word-boundary aware. Entries MUST
 * be genuine clichés — vague self-description that carries no evidence — never a
 * legitimate hard skill or tool. A false positive here erodes trust the same way
 * a full-dictionary spell check does (see cv-spellcheck).
 */

/** Each phrase is a lower-case cliché. Multi-word phrases are matched as a unit. */
export const BUZZWORDS: readonly string[] = [
  // self-description with no evidence
  "out of the box",
  "out-of-the-box",
  "think outside the box",
  "problem solver",
  "team player",
  "hard worker",
  "hard-working",
  "go-getter",
  "self-starter",
  "self starter",
  "results-driven",
  "results driven",
  "results-oriented",
  "detail-oriented",
  "detail oriented",
  "goal-oriented",
  "highly motivated",
  "proactive",
  "dynamic",
  "passionate",
  "enthusiastic",
  "hardworking",
  "go getter",
  "people person",
  "value add",
  "value-add",
  "best of breed",
  "best-of-breed",
  // corporate filler verbs / nouns
  "synergy",
  "synergies",
  "leverage",
  "leveraging",
  "spearheaded", // over-used; flagged as soft (see WEAK if used as opener)
  "utilize",
  "utilized",
  "utilizing",
  "seamless",
  "seamlessly",
  "cutting-edge",
  "cutting edge",
  "world-class",
  "world class",
  "wheelhouse",
  "move the needle",
  "hit the ground running",
  "wear many hats",
  "bring to the table",
  "track record",
  "thought leader",
  "thought leadership",
  "guru",
  "ninja",
  "rockstar",
  "rock star",
] as const

/** Weak sentence openers — a bullet that starts with these describes duty, not
 *  achievement. Flagged as a "Sharpen"-adjacent weak-verb finding. Lower-case,
 *  matched only at the START of a bullet (after trimming leading punctuation). */
export const WEAK_OPENERS: readonly string[] = [
  "responsible for",
  "worked on",
  "worked with",
  "helped",
  "helped to",
  "assisted with",
  "assisted in",
  "involved in",
  "participated in",
  "tasked with",
  "duties included",
  "in charge of",
  "handled",
  "managed to",
] as const
