import { getRefreshToken, setTokens } from "./storage.js"

function endpoint(apiUrl, path) {
  return `${apiUrl.replace(/\/$/, "")}${path}`
}

/**
 * Exchange the stored refresh token for a fresh session via the backend.
 * Reads + writes storage (not args) so it always rotates the LATEST token —
 * Supabase invalidates a refresh token once used, so a stale copy would fail.
 * Returns the new access token, or null when refresh isn't possible.
 */
async function refreshSession(apiUrl) {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return null
  const response = await fetch(endpoint(apiUrl, "/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  if (!data?.access_token) return null
  await setTokens({ token: data.access_token, refreshToken: data.refresh_token })
  return data.access_token
}

async function request(apiUrl, token, path, body, _retried = false) {
  if (!token) throw new Error("Connect Myro before saving jobs.")
  const response = await fetch(endpoint(apiUrl, path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  // Access token expired (1h Supabase TTL) — refresh once and retry so the user
  // never has to reconnect mid-session.
  if (response.status === 401 && !_retried) {
    const fresh = await refreshSession(apiUrl)
    if (fresh) return request(apiUrl, fresh, path, body, true)
    throw new Error("Your Myro session expired. Click Connect with Myro to reconnect.")
  }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Myro API returned HTTP ${response.status}`)
  }
  return response.json()
}

function toPreviewPayload(draft) {
  return {
    source_url: draft.sourceUrl,
    source_platform: draft.sourcePlatform || "generic",
    role_name: draft.roleName || "",
    company_name: draft.companyName || null,
    location: draft.location || null,
    job_description: draft.jobDescription || "",
    page_title: draft.pageTitle || null,
    capture_method: draft.captureMethod || "visible_page",
  }
}

export async function previewImport(apiUrl, token, draft) {
  return request(apiUrl, token, "/jobs/import/preview", toPreviewPayload(draft))
}

export async function saveImport(apiUrl, token, state) {
  return request(apiUrl, token, "/jobs/import", {
    source_url: state.sourceUrl,
    source_platform: state.sourcePlatform || "generic",
    role_name: state.roleName,
    company_name: state.companyName || null,
    location: state.location || null,
    job_description: state.jobDescription,
    primary_skills: state.primarySkills,
    secondary_skills: state.secondarySkills,
    emerging_skills: state.emergingSkills.map((label) => ({
      label,
      skill_type: "secondary",
      source: "user_added",
    })),
    capture_method: state.captureMethod || "visible_page",
  })
}
