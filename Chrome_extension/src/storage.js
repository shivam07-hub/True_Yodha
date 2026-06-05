const DEFAULT_API_URL = "https://api.himyro.com"
const STORAGE_KEYS = {
  apiUrl: "myro_api_url",
  token: "myro_token",
  refreshToken: "myro_refresh_token",
}

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
