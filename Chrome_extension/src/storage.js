const DEFAULT_API_URL = "https://api.himyro.com"
const STORAGE_KEYS = {
  apiUrl: "myro_api_url",
  token: "myro_token",
  refreshToken: "myro_refresh_token",
  trackedJobs: "myro_tracked_jobs",
  careerProfile: "myro_career_profile",
}

// Cap the tracked-job memory so storage can't grow unbounded across a long
// browsing history. Oldest entries drop first (LRU by saved_at).
const TRACKED_JOBS_LIMIT = 200

function hasChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage?.local
}

// Earlier builds shipped a localhost default. A user who opened Settings then
// has `http://localhost:8000` persisted, which overrides the new prod default
// and silently breaks every fetch. Upgrade any stale localhost value in place.
function healApiUrl(value) {
  if (!value) return DEFAULT_API_URL
  if (/localhost:8000|127\.0\.0\.1:8000/.test(value)) return DEFAULT_API_URL
  return value
}

export async function getConfig() {
  let apiUrl
  let token
  let refreshToken
  if (hasChromeStorage()) {
    const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS))
    apiUrl = data[STORAGE_KEYS.apiUrl]
    token = data[STORAGE_KEYS.token] || ""
    refreshToken = data[STORAGE_KEYS.refreshToken] || ""
  } else {
    apiUrl = localStorage.getItem(STORAGE_KEYS.apiUrl)
    token = localStorage.getItem(STORAGE_KEYS.token) || ""
    refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken) || ""
  }

  const healed = healApiUrl(apiUrl)
  if (apiUrl && healed !== apiUrl) {
    // Persist the upgrade so the migration runs once, not on every open.
    await writeApiUrl(healed)
  }
  return { apiUrl: healed, token, refreshToken }
}

async function writeApiUrl(apiUrl) {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [STORAGE_KEYS.apiUrl]: apiUrl })
    return
  }
  localStorage.setItem(STORAGE_KEYS.apiUrl, apiUrl)
}

export async function saveConfig(config) {
  const payload = {
    [STORAGE_KEYS.apiUrl]: config.apiUrl || DEFAULT_API_URL,
    [STORAGE_KEYS.token]: config.token || "",
    [STORAGE_KEYS.refreshToken]: config.refreshToken || "",
  }
  if (hasChromeStorage()) {
    await chrome.storage.local.set(payload)
    return
  }
  for (const [key, value] of Object.entries(payload)) {
    localStorage.setItem(key, value)
  }
}

// A job page's identity for "have I already tracked this?". Drop the hash and a
// trailing slash so /jobs/123 and /jobs/123#apply resolve to the same key; keep
// the query string because ATS boards (Ashby, Greenhouse, Lever…) carry the job
// id there.
export function jobUrlKey(url) {
  if (!url) return ""
  try {
    const parsed = new URL(url)
    parsed.hash = ""
    let key = parsed.toString()
    if (key.endsWith("/")) key = key.slice(0, -1)
    return key
  } catch {
    return url.split("#")[0].replace(/\/$/, "")
  }
}

async function readTrackedJobs() {
  if (hasChromeStorage()) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.trackedJobs])
    return data[STORAGE_KEYS.trackedJobs] || {}
  }
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.trackedJobs) || "{}")
  } catch {
    return {}
  }
}

async function writeTrackedJobs(map) {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [STORAGE_KEYS.trackedJobs]: map })
    return
  }
  localStorage.setItem(STORAGE_KEYS.trackedJobs, JSON.stringify(map))
}

/** Look up a previously-tracked job by page URL, or null if never tracked. */
export async function getTrackedJob(url) {
  const key = jobUrlKey(url)
  if (!key) return null
  const map = await readTrackedJobs()
  return map[key] || null
}

/** Remember that this page was tracked so a return visit skips the Track menu. */
export async function recordTrackedJob(url, { jobId, title }) {
  const key = jobUrlKey(url)
  if (!key) return
  const map = await readTrackedJobs()
  map[key] = { job_id: jobId || "", title: title || "", saved_at: Date.now() }
  const keys = Object.keys(map)
  if (keys.length > TRACKED_JOBS_LIMIT) {
    keys
      .sort((a, b) => (map[a].saved_at || 0) - (map[b].saved_at || 0))
      .slice(0, keys.length - TRACKED_JOBS_LIMIT)
      .forEach((stale) => delete map[stale])
  }
  await writeTrackedJobs(map)
}

/** Read the current refresh token (single source of truth for token rotation). */
export async function getRefreshToken() {
  if (hasChromeStorage()) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.refreshToken])
    return data[STORAGE_KEYS.refreshToken] || ""
  }
  return localStorage.getItem(STORAGE_KEYS.refreshToken) || ""
}

/** Persist a rotated access+refresh token pair after a refresh. */
export async function setTokens({ token, refreshToken }) {
  const payload = {
    [STORAGE_KEYS.token]: token || "",
    [STORAGE_KEYS.refreshToken]: refreshToken || "",
  }
  if (hasChromeStorage()) {
    await chrome.storage.local.set(payload)
    return
  }
  for (const [key, value] of Object.entries(payload)) {
    localStorage.setItem(key, value)
  }
}

/** Cache the Career Profile for background-fed ATS auto-fill (lock L9). Stored
 *  under the caller's session; cleared on disconnect alongside tokens. */
export async function setCachedCareerProfile(profile) {
  const value = profile || null
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [STORAGE_KEYS.careerProfile]: value })
    return
  }
  localStorage.setItem(STORAGE_KEYS.careerProfile, JSON.stringify(value))
}

/** Read the cached Career Profile (CareerProfileData), or null when absent. */
export async function getCachedCareerProfile() {
  if (hasChromeStorage()) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.careerProfile])
    return data[STORAGE_KEYS.careerProfile] || null
  }
  const raw = localStorage.getItem(STORAGE_KEYS.careerProfile)
  return raw ? JSON.parse(raw) : null
}
