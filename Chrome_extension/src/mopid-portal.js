const MOPID_JOB_API = "https://ats.mopid.me/api/v1.0/job"
const MOPID_HOST_PATTERN = /(^|\.)mopid\.me$/
const MOPID_JOB_ID_PATTERN = /^[a-z0-9]+-[a-z0-9]+$/i

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function mopidJobIdFromUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl)
    const jobId = url.searchParams.get("jobId") || ""
    return MOPID_HOST_PATTERN.test(url.hostname) && MOPID_JOB_ID_PATTERN.test(jobId)
      ? jobId
      : null
  } catch {
    return null
  }
}

/**
 * MOPID renders only the application form in the initial document. Its public
 * job endpoint is the durable source for the full description and structured
 * job fields, so enrich the normal DOM capture without sending user data.
 */
export async function enrichMopidPortalDraft(draft, fetchImpl = globalThis.fetch) {
  const jobId = draft?.sourcePlatform === "mopid" ? mopidJobIdFromUrl(draft.sourceUrl) : null
  if (!jobId || typeof fetchImpl !== "function") return draft

  try {
    const response = await fetchImpl(`${MOPID_JOB_API}?job_uuid=${encodeURIComponent(jobId)}`, {
      headers: { Accept: "application/json" },
    })
    if (!response.ok) return draft

    const payload = await response.json()
    const job = payload?.status === 200 ? payload.data : null
    if (!job) return draft

    const roleName = cleanText(job.job_name) || draft.roleName
    const companyName = cleanText(job.company_name) || draft.companyName
    const location = cleanText(job.job_location) || draft.location
    const endpointDescription = cleanText(job.job_description)
    const preservesSelection = draft.captureMethod === "selected_text"
    const jobDescription = preservesSelection ? draft.jobDescription : endpointDescription || draft.jobDescription
    const captureMethod = preservesSelection ? draft.captureMethod : endpointDescription ? "known_portal" : draft.captureMethod
    const fieldSources = {
      ...draft.fieldSources,
      role: roleName ? "known_portal" : draft.fieldSources?.role || null,
      company: companyName ? "known_portal" : draft.fieldSources?.company || null,
      location: location ? "known_portal" : draft.fieldSources?.location || null,
      jobDescription: captureMethod,
    }

    return {
      ...draft,
      roleName,
      companyName,
      location,
      jobDescription,
      captureMethod,
      confidence: captureMethod === "known_portal" ? 0.84 : draft.confidence,
      fieldSources,
      needsBackstop: !roleName || !companyName || !location,
    }
  } catch {
    // DOM extraction remains usable if MOPID's public endpoint is unavailable.
    return draft
  }
}
