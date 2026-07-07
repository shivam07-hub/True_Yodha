import { careersSearchUrl } from "@/lib/jobs/apply-transport"

/** Locked share copy — sent with the job's careers link via the Web Share sheet. */
export const JOB_SHARE_TEXT =
  "Hey, found this job on Himyro career portal, where all the company career pages are tracked and shared according to your resume"

/** Careers link = the shared Apply Transport careers-search primitive. */
export function careersUrl(company: string | null | undefined): string | null {
  return careersSearchUrl(company)
}

/**
 * Share a specific role: keeps the Himyro blurb, adds the role title and the
 * job's direct apply link so the recipient lands on the exact posting. Falls
 * back to the "{company} careers" search link when a posting has no apply_url.
 *
 * Note: the internal `job_id` is NOT shared — it is a dedup hash for ~45% of
 * rows (notably every Workday tenant), so it is not searchable on a company
 * career page. The apply link is the reliable handle. See
 * firecrawl_Supabase/docs/reports for the root-cause writeup.
 */
export async function shareJobRole(
  job: { job_title: string; company_name?: string | null; source_url?: string | null },
): Promise<"shared" | "copied" | null> {
  const url = job.source_url?.trim() || careersUrl(job.company_name)
  if (!url) return null
  const who = job.company_name ? `${job.job_title} @ ${job.company_name}` : job.job_title
  const title = `${who} — on Myro`
  const text = `${JOB_SHARE_TEXT}\n\nRole: ${who}`

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url })
      return "shared"
    } catch {
      // cancelled / unsupported — fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
    return "copied"
  } catch {
    window.prompt("Copy this link:", url)
    return null
  }
}

/**
 * Share a job via the Web Share API (mobile / Safari → native sheet, WhatsApp
 * first on India mobile); elsewhere → clipboard. Returns "shared" when the
 * native sheet handled it, "copied" when it fell back to clipboard, or null
 * when there was nothing to share / the user cancelled with no fallback.
 */
export async function shareJob(company: string | null | undefined): Promise<"shared" | "copied" | null> {
  const url = careersUrl(company)
  if (!url) return null
  const title = company ? `${company} role on Myro` : "A role on Myro"

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text: JOB_SHARE_TEXT, url })
      return "shared"
    } catch {
      // cancelled / unsupported — fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(`${JOB_SHARE_TEXT}\n${url}`)
    return "copied"
  } catch {
    window.prompt("Copy this link:", url)
    return null
  }
}
