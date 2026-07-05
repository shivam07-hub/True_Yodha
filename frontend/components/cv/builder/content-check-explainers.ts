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
 * Voice: recruiter's-eye, plain, no jargon (feedback_minimal_ui_words). One
 * headline + a couple of terse reasons, collapsed by default in the rail.
 */
import type { ContentCategory } from "./content-checks"

export interface CheckExplainer {
  /** Collapsed accordion header. */
  title: string
  /** Expanded reasons — terse, recruiter-POV. */
  reasons: string[]
}

export const CHECK_EXPLAINERS: Record<ContentCategory, CheckExplainer> = {
  buzzword: {
    title: "Why cut buzzwords",
    reasons: [
      "Everyone claims them, so a recruiter reads past them.",
      "They assert instead of prove — show the work, not the label.",
      "They eat space a real achievement could use.",
    ],
  },
  "weak-verb": {
    title: "Why not lead with a duty",
    reasons: [
      '"Responsible for" describes the job, not what you did with it.',
      "Open with the result and a strong verb — the recruiter sees impact first.",
    ],
  },
  unquantified: {
    title: "Why add a number",
    reasons: [
      "A number turns a claim into evidence a recruiter can trust.",
      "Scale, speed, or money makes the line concrete and comparable.",
      "If you don't have the exact figure, an honest estimate still beats none.",
    ],
  },
  repetition: {
    title: "Why vary the phrasing",
    reasons: [
      "The same phrase twice reads as filler and dulls both lines.",
      "Different words let more of your range show.",
    ],
  },
}
