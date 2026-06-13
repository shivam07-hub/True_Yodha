/** Locked share copy — sent with the job's careers link via the Web Share sheet. */
export const JOB_SHARE_TEXT =
  "Hey, found this job on Himyro career portal, where all the company career pages are tracked and shared according to your resume"

/** Careers link mirrors the ApplyRow heuristic — Google search "{company} careers". */
export function careersUrl(company: string | null | undefined): string | null {
  return company
    ? `https://www.google.com/search?q=${encodeURIComponent(`${company} careers`)}`
    : null
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
