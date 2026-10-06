/**
 * entry-view — what the popup shows for a job Myro already holds.
 *
 * The server answers "which of my jobs is this page?" with a Page Entry (job id,
 * stage, title, company). This module turns that answer into the popup's one
 * next step, following the goal line: saved → tailor, tailored → apply,
 * applied → prepare. Pure, so the stage rules test without a browser.
 */

const PILL = { saved: "Saved", tailored: "Tailored", applied: "Applied" }

/**
 * @param {{ job_id: string, stage: string, title: string, company?: string | null }} entry
 * @param {string} web  the Myro web origin
 */
export function entryView(entry, web) {
  const id = encodeURIComponent(entry.job_id)
  const tailor = `${web}/cv?jobId=${id}`
  const room = `${web}/preparations/${id}`
  const primary =
    entry.stage === "applied"
      ? { label: "Prepare for this job", href: room }
      : entry.stage === "tailored"
        ? { label: "Open your tailored CV", href: tailor }
        : { label: "Tailor your CV", href: tailor }
  return {
    pill: PILL[entry.stage] || "Saved",
    title: entry.title || "This job",
    company: entry.company || "",
    primary,
    // Only an extension import is the user's own row to correct; a job from
    // Myro's list is shared corpus and would be re-saved as a duplicate.
    canFixDetails: entry.job_id.startsWith("ext_"),
  }
}
