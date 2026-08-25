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
      before: "A results-driven team player who thinks outside the box on cloud deals.",
      after: "Closed 9 cloud deals in FY24 by pairing pre-sales with the delivery leads.",
    },
  },
  "weak-verb": {
    title: "Why not lead with a duty",
    reasons: [
      '"Responsible for" describes the job, not what you did with it.',
      "Open with the result and a strong verb — the recruiter sees impact first.",
    ],
    example: {
      before: "Responsible for running weekly demos for prospective finance teams.",
      after: "Ran 40+ weekly demos for finance teams, lifting demo-to-trial 18%.",
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
      before: "Connected with clients at Capgemini to understand their cloud service needs.",
      after: "Ran cloud discovery with 14 Capgemini accounts, converting 6 into signed work.",
    },
  },
  repetition: {
    title: "Why vary the phrasing",
    reasons: [
      "The same phrase twice reads as filler and dulls both lines.",
      "Different words let more of your range show.",
    ],
    example: {
      before: "Built GTM strategy for GCC clients. Built GTM strategy for EMEA clients.",
      after: "Built the GCC go-to-market from scratch. Adapted it for EMEA, cutting ramp to 6 weeks.",
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
