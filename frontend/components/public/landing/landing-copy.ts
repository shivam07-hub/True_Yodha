/* Locked copy from the design handoff (reference/building landing page.zip).
   Voice rules: spec §1 — calm, precise, observational. Do not rewrite here
   without a design-review pass. Shared by client sections and the server
   page (FAQ JSON-LD), so keep this module dependency-free. */

export interface FaqItem {
  q: string
  a: string
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "Is Myro free?",
    a: "Yes, free to start. XP lets you unlock skill advice and company intel. No credit card.",
  },
  {
    q: "How is this different from LinkedIn or Naukri?",
    a: "They show you jobs. The Myro Engine scores your CV against live hiring demand and shows you exactly what's stopping you from getting them — then helps you fix it.",
  },
  {
    q: "What is the Myro Score?",
    a: "A 0–100 score across 10 career domains, computed by the Engine from your CV skills against real hiring demand. It rises as you practice skills and add evidence.",
  },
  {
    q: "Is my CV private?",
    a: "Yes. Your CV is never shared or visible to recruiters. Your public profile shows only your score and domain map — never your CV text.",
  },
  {
    q: "What is Forge?",
    a: "Your practice yard. Pick a skill the Engine says is in demand, clear levelled question sets, move from L0 to L5.",
  },
]

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
