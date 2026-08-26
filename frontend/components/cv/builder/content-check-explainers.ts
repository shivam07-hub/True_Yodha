/**
 * content-check-explainers — the authored "why this check exists" copy (grill Q6).
 *
 * Static, free, instant: understanding WHY a fix matters is part of the trust
 * surface, so it can never cost a coin or wait on an LLM. One authored blurb per
 * content-check category, sourced from the Myro CV playbook (the same shelf that
 * grounds the rewrite, #32). This is the check-LEVEL "why"; the instance-level
 * citation ("per the Google XYZ formula…") already ships on the rewrite path via
 * #32's `citations` chip — this module does NOT duplicate that.
 *
 * 2026-08-25: added `example`. The Resume Worded teardown's pattern 9 pairs the
 * explanation with a written before/after, and that pair does more work than the
 * prose — a user who sees one good line usually fixes the next twelve themselves,
 * faster than the model and without spending anything. It also makes Mentor
 * optional rather than compulsory, which was the whole complaint: every route
 * from "something is wrong" to "here is what is wrong" used to run through an
 * LLM call.
 *
 * 2026-08-26: the examples were REWRITTEN. The first pass was drafted off the
 * CV that was open in the test harness, so every `before` carried that user's
 * own employers and domain — one of them was a verbatim copy of his own bullet.
 * Sitting two lines under the real line, an example that names your employer
 * does not read as an example; it reads as a garbled quote of your CV, and the
 * first thing the user did was go looking for a line he had never written.
 *
 * So: no proper nouns, no employer, no industry that could belong to a specific
 * reader. Each pair changes exactly ONE thing — the defect being explained — so
 * the transformation is the only thing on show. buildIssues additionally drops
 * any example that collides with a line in the CV in front of the user, which
 * makes the failure mode structurally impossible rather than merely unlikely.
 *
 * Also added ATS_EXPLAINERS. Failing machine-readability rows now sit in the same
 * queue as content fixes (hierarchy redesign §4.4), so they owe the reader the
 * same free "why" — a row you cannot act on and cannot understand is worse than
 * no row.
 *
 * Voice: recruiter's-eye, plain, no jargon (feedback_minimal_ui_words). Every
 * claim here is one a recruiter or an ATS parser would actually make. Nothing in
 * this file is generated.
 */
import type { ContentCategory } from "./content-checks"

export interface CheckExample {
  before: string
  after: string
}

export interface CheckExplainer {
  /** Collapsed accordion header. */
  title: string
  /** Expanded reasons — terse, recruiter-POV. */
  reasons: string[]
  /** The same defect, fixed, written out. Authored — never model output. */
  example: CheckExample
}

export const CHECK_EXPLAINERS: Record<ContentCategory, CheckExplainer> = {
  buzzword: {
    title: "Why cut buzzwords",
    reasons: [
      "Everyone claims them, so a recruiter reads past them.",
      "They assert instead of prove — show the work, not the label.",
      "They eat space a real achievement could use.",
    ],
    example: {
      before: "A results-driven team player who thinks outside the box.",
      after: "Cut onboarding time from 9 days to 3 by rewriting the setup guide.",
    },
  },
  "weak-verb": {
    title: "Why not lead with a duty",
    reasons: [
      '"Responsible for" describes the job, not what you did with it.',
      "Open with the result and a strong verb — the recruiter sees impact first.",
    ],
    example: {
      before: "Responsible for the weekly release checklist.",
      after: "Ran the weekly release checklist, cutting failed deploys from 6 a month to 1.",
    },
  },
  unquantified: {
    title: "Why add a number",
    reasons: [
      "A number turns a claim into evidence a recruiter can trust.",
      "Scale, speed, or money makes the line concrete and comparable.",
      "If you don't have the exact figure, an honest estimate still beats none.",
    ],
    example: {
      // The ONLY difference is the number — the defect being explained, and
      // nothing else, so the reader sees exactly what the fix costs them.
      before: "Rebuilt the signup flow with the design team.",
      after: "Rebuilt the signup flow with the design team, lifting completion from 54% to 71%.",
    },
  },
  repetition: {
    title: "Why vary the phrasing",
    reasons: [
      "The same phrase twice reads as filler and dulls both lines.",
      "Different words let more of your range show.",
    ],
    example: {
      before: "Led the migration for the retail team. Led the migration for the finance team.",
      after: "Led the retail migration. Repeated it for finance in half the time.",
    },
  },
}

/**
 * Why a failing machine-readability check costs the user, keyed by the check's
 * own provenance tag. Plain mechanics, not recruiter psychology — an ATS is a
 * parser, and saying so is more honest than dressing it up.
 */
export const ATS_EXPLAINERS: Record<string, string[]> = {
  "section headings": [
    "Parsers look for standard headings to know where experience ends and education starts.",
    "A section it can't find is a section it files as blank.",
  ],
  contact: [
    "The parser copies these straight into the recruiter's system.",
    "A missing field is a candidate they can read but cannot reply to.",
  ],
  dates: [
    "Unreadable dates break the tenure calculation most filters sort on.",
    "A role with no parseable range can drop out of a date-filtered search.",
  ],
  filename: [
    "The filename travels with the file and is often the first thing a human sees.",
    "Special characters break some upload forms outright.",
  ],
  spelling: [
    "A typo in a skill name means the keyword search never finds it.",
    "It is the cheapest thing on this page to fix and the most expensive to leave.",
  ],
  layout: [
    "Multi-column and image-based layouts scramble in a text extractor.",
  ],
}

/** Why an empty section is worth filling. Optional by definition — these say
 *  what the section buys, never that it is required. */
export const SECTION_EXPLAINERS: Record<string, string[]> = {
  skills: [
    "The skills line is what a keyword search matches against first.",
    "It is also where a reader checks their shortlist in three seconds.",
  ],
  education: [
    "Some filters require a degree field before a CV reaches a human.",
  ],
  certs: [
    "Worth a line only when a certificate names a tool the job asks for.",
  ],
}
