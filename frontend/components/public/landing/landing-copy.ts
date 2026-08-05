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

export const FAQ_ITEMS: FaqItem[] = [
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
