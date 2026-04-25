function endpoint(apiUrl, path) {
  return `${apiUrl.replace(/\/$/, "")}${path}`
}

async function request(apiUrl, token, path, body) {
  if (!token) throw new Error("Connect Mirko before saving jobs.")
  const response = await fetch(endpoint(apiUrl, path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Mirko API returned HTTP ${response.status}`)
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
