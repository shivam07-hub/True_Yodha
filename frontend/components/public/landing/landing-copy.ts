/* Locked copy from the design handoff (reference/building landing page.zip).
   Voice rules: spec §1 — calm, precise, observational. Do not rewrite here
   without a design-review pass. Shared by client sections and the server
   page (FAQ JSON-LD), so keep this module dependency-free. */

export interface FaqItem {
  q: string
  a: string
  /* FAQPage governance: one Q/A = one canonical URL. /docs#faq is the product-FAQ
     hub and owns the schema for product/reference questions. Mark `schema: true`
     ONLY on landing-unique conversion questions that /docs does not cover, so the
     two surfaces never emit duplicate structured data. */
  schema?: boolean
}

/* What's free vs what spends Myro Coins. Plain, honest split — no fake tiers.
   The product is one coin wallet (3,000 to start, earns back through use),
   not a SaaS Free/Pro/Enterprise grid. Keep both columns concrete. */
export const PRICING_FREE: string[] = [
  "Your Myro Score",
  "Full 10-domain analysis",
  "Live job matches",
  "Forge skill practice",
  "Diary & CV versions",
]

export const PRICING_PAID: string[] = [
  "Deep per-job fit analysis",
  "Company intel & follows",
  "AI CV rewrite & restructure",
  "Refresh your matches",
]

/* The give-and-take thesis: coins meter a shared engine. Contributing signal
   (practice, tracking, diary) earns them; drawing intelligence spends them —
   and because the engine is shared, every contribution sharpens the matches
   everyone gets. This is the collective job-hunt loop in one line. */
export const PRICING_LEAD =
  "Myro Coins meter a shared engine: contribute signal to earn them, draw intelligence to spend. Every contribution sharpens the matches everyone gets."

export const PRICING_FOOTNOTE =
  "Start with 3,000 Myro Coins — about 2 months of normal use. Earn more as you practice; top up anytime."

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "How is this different from LinkedIn or Naukri?",
    a: "They show you jobs. The Myro Engine scores your CV against live hiring demand and shows you exactly what's stopping you from getting them — then helps you fix it.",
    schema: true,
  },
  {
    // Score intent is owned by /docs#faq ("How is my Myro Score calculated?") — no schema here.
    q: "What is the Myro Score?",
    a: "A 0–100 score across 10 career domains, computed by the Engine from your CV skills against real hiring demand. It rises as you practice skills and add evidence.",
  },
  {
    // CV-privacy intent is owned by /docs#faq ("Is my CV shared…?") — no schema here.
    q: "Is my CV private?",
    a: "Your public profile shows your Myro Score and domain map.",
  },
  {
    q: "What is Forge?",
    a: "Your practice yard. Pick a skill the Engine says is in demand, clear levelled question sets, move from L0 to L5.",
    schema: true,
  },
  {
    // Pricing/"free to start" is a landing-unique conversion question /docs#faq
    // doesn't own → schema:true so it can surface as structured FAQ data.
    q: "Do I need to pay to start?",
    a: "No. Your Myro Score, the full 10-domain analysis, live job matches, and skill practice are free. You start with 3,000 Myro Coins; only deeper actions — per-job fit analysis and AI CV rewrites — spend them.",
    schema: true,
  },
]

/* PLACEHOLDER — beta testimonials. Structure is final (component reads this
   array); the copy + names are seeded placeholders to be confirmed or replaced
   by Shivam with real, consented beta-cohort quotes. Do NOT present unverified
   quotes as real named endorsements — swap the text/who before public launch.
   Keep `who` first-name-only + `meta` honest ("beta cohort"). */
export const QUOTES = [
  {
    text: "The Myro Score and skill mapping made the platform feel highly intelligent from the start.",
    who: "Aman",
    meta: "beta cohort",
  },
  {
    text: "Having multiple CV versions in one place instead of random PDFs scattered everywhere is genuinely useful.",
    who: "Ananya",
    meta: "beta cohort",
  },
  {
    text: "The light theme looks clean and professional. The job-targeting system is a strong idea.",
    who: "Ashu",
    meta: "beta cohort",
  },
]
