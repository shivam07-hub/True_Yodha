/**
 * Finlatics partner catalogue — the eleven programs on finlatics.com,
 * attributed so they can credit Myro. Their instruction: take the landing
 * Apply Now URLs and replace `website` with our src code.
 *
 * One program (`da`, Business Analyst with Excel) uses `src=`; the rest use
 * `utm_src=`. We keep that split so their tracker sees the same param it
 * already reads.
 *
 * Blurbs are Finlatics' own program lines, tightened to one sentence.
 * Prep shows them on hover/click before the apply form.
 */

export const FINLATICS_ORIGIN = "https://www.finlatics.com"
export const FINLATICS_SRC = "myroref"
/** Local mark for the landing ticker and Prep training card. */
export const FINLATICS_LOGO_SRC = "/brand/finlatics.png"
export const FINLATICS_APPLY_LABEL = "Apply on Finlatics"

export type FinlaticsAttr = "utm_src" | "src"

export type FinlaticsProgram = {
  id: string
  title: string
  mark: string
  path: string
  attr: FinlaticsAttr
  blurb: string
}

export const FINLATICS_PROGRAMS: readonly FinlaticsProgram[] = [
  {
    id: "fa",
    title: "Financial Analyst",
    mark: "FA",
    path: "/fa_applications/1",
    attr: "utm_src",
    blurb: "Simulated portfolio management, private equity and venture capital cases, and valuation models.",
  },
  {
    id: "ibep",
    title: "Investment Banking",
    mark: "IB",
    path: "/ibep_applications/1",
    attr: "utm_src",
    blurb: "Private equity and venture capital cases. Start-up valuation and financing.",
  },
  {
    id: "actualBads",
    title: "Business Analyst & Data Science",
    mark: "BA",
    path: "/actualBads_applications/1",
    attr: "utm_src",
    blurb: "Python for data-driven decisions, plus the statistics a business analyst uses.",
  },
  {
    id: "webdev",
    title: "Full Stack Development",
    mark: "FS",
    path: "/webdev_applications",
    attr: "utm_src",
    blurb: "Build and ship five production apps. Next.js, APIs, databases, deploy.",
  },
  {
    id: "pm",
    title: "Product Management with AI",
    mark: "PM",
    path: "/pm_applications",
    attr: "utm_src",
    blurb: "Ten live PM scenarios on an Indian fintech. Interviews, roadmap, PRDs, UX critique.",
  },
  {
    id: "dmep",
    title: "Derivative Markets",
    mark: "DM",
    path: "/dmep_application/1",
    attr: "utm_src",
    blurb: "Forwards, futures and options. F&O trading strategies and investment cases.",
  },
  {
    id: "fm",
    title: "Financial Markets",
    mark: "FM",
    path: "/fm_applications/1",
    attr: "utm_src",
    blurb: "Simulated portfolio management. Casework on building and balancing a book.",
  },
  {
    id: "da",
    title: "Business Analyst with Excel",
    mark: "EX",
    path: "/da_applications/1",
    attr: "src",
    blurb: "Excel and Power BI. Forecasting, profitability, and pricing.",
  },
  {
    id: "bads",
    title: "Data Science & Machine Learning",
    mark: "DS",
    path: "/bads_applications/1",
    attr: "utm_src",
    blurb: "Python and exploratory data work, then machine learning on the same dataset.",
  },
  {
    id: "mrp",
    title: "Market Research Analyst",
    mark: "MR",
    path: "/mrp_applications/1",
    attr: "utm_src",
    blurb: "How a marketing model connects to a business model, then research you can present.",
  },
  {
    id: "ml",
    title: "Machine Learning",
    mark: "ML",
    path: "/ml_applications/1",
    attr: "utm_src",
    blurb: "Python in Colab. Supervised and unsupervised learning algorithms.",
  },
]

export function finlaticsHref(program: FinlaticsProgram, src = FINLATICS_SRC): string {
  const url = new URL(program.path, FINLATICS_ORIGIN)
  url.searchParams.set(program.attr, src)
  return url.toString()
}

export function finlaticsHomeHref(src = FINLATICS_SRC): string {
  const url = new URL(FINLATICS_ORIGIN)
  url.searchParams.set("utm_src", src)
  return url.toString()
}
