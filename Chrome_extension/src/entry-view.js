/**
 * entry-view — what the popup shows for a job Myro already holds.
 *
 * The server answers "which of my jobs is this page?" with a Page Entry (job id,
 * stage, title, company). This module turns that answer into the popup's one
 * next step, following the goal line: saved → tailor, tailored → apply,
 * applied → prepare. Pure, so the stage rules test without a browser.
 *
 * "I applied" is the user's own answer — never inferred from the page (CONTEXT
 * → Collection Record: never advance a stage on the user's behalf).
 */

const PILL = { saved: "Saved", tailored: "Tailored", applied: "Applied" }

/**
 * @param {{ job_id: string, stage: string, title: string, company?: string | null, pending_apply?: boolean }} entry
 * @param {string} web  the Myro web origin
 */
export function entryView(entry, web) {
  const id = encodeURIComponent(entry.job_id)
  const tailor = `${web}/cv?jobId=${id}`
  const room = `${web}/preparations/${id}`
  const next =
    entry.stage === "applied"
      ? { label: "Prepare for this job", href: room }
      : entry.stage === "tailored"
        ? { label: "Open your tailored CV", href: tailor }
        : { label: "Tailor your CV", href: tailor }
  return {
    pill: PILL[entry.stage] || "Saved",
    title: entry.title || "This job",
    company: entry.company || "",
    // The user is on the company's own page with a CV aimed at this job — the
    // moment the goal line reaches "apply". An unanswered Apply click from Myro
    // asks the same question even before a tailor.
    applyFirst: entry.stage === "tailored" || (entry.stage === "saved" && Boolean(entry.pending_apply)),
    next,
    // Only an extension import is the user's own row to correct; a job from
    // Myro's list is shared corpus and would be re-saved as a duplicate.
    canFixDetails: entry.job_id.startsWith("ext_"),
  }
}
