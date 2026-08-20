/**
 * Finlatics partner catalogue — the eleven programs on finlatics.com,
 * attributed so they can credit Myro. Their instruction: take the landing
 * Apply Now URLs and replace `website` with our src code.
 *
 * One program (`da`, Business Analyst with Excel) uses `src=`; the rest use
 * `utm_src=`. We keep that split so their tracker sees the same param it
 * already reads.
 */

export const FINLATICS_ORIGIN = "https://www.finlatics.com"
export const FINLATICS_SRC = "myroref"

export type FinlaticsAttr = "utm_src" | "src"

export type FinlaticsProgram = {
  id: string
  title: string
  mark: string
  path: string
  attr: FinlaticsAttr
}

export const FINLATICS_PROGRAMS: readonly FinlaticsProgram[] = [
  { id: "fa", title: "Financial Analyst", mark: "FA", path: "/fa_applications/1", attr: "utm_src" },
  { id: "ibep", title: "Investment Banking", mark: "IB", path: "/ibep_applications/1", attr: "utm_src" },
  { id: "actualBads", title: "Business Analyst & Data Science", mark: "BA", path: "/actualBads_applications/1", attr: "utm_src" },
  { id: "webdev", title: "Full Stack Development", mark: "FS", path: "/webdev_applications", attr: "utm_src" },
  { id: "pm", title: "Product Management with AI", mark: "PM", path: "/pm_applications", attr: "utm_src" },
  { id: "dmep", title: "Derivative Markets", mark: "DM", path: "/dmep_application/1", attr: "utm_src" },
  { id: "fm", title: "Financial Markets", mark: "FM", path: "/fm_applications/1", attr: "utm_src" },
  { id: "da", title: "Business Analyst with Excel", mark: "EX", path: "/da_applications/1", attr: "src" },
  { id: "bads", title: "Data Science & Machine Learning", mark: "DS", path: "/bads_applications/1", attr: "utm_src" },
  { id: "mrp", title: "Market Research Analyst", mark: "MR", path: "/mrp_applications/1", attr: "utm_src" },
  { id: "ml", title: "Machine Learning", mark: "ML", path: "/ml_applications/1", attr: "utm_src" },
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
