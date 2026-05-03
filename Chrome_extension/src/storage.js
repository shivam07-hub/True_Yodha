const DEFAULT_API_URL = "http://localhost:8000"
const STORAGE_KEYS = {
  apiUrl: "myro_api_url",
  token: "myro_token",
}

function hasChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage?.local
}

export async function getConfig() {
  if (hasChromeStorage()) {
    const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS))
    return {
      apiUrl: data[STORAGE_KEYS.apiUrl] || DEFAULT_API_URL,
      token: data[STORAGE_KEYS.token] || "",
    }
  }

  return {
    apiUrl: localStorage.getItem(STORAGE_KEYS.apiUrl) || DEFAULT_API_URL,
    token: localStorage.getItem(STORAGE_KEYS.token) || "",
  }
}

export async function saveConfig(config) {
  const payload = {
    [STORAGE_KEYS.apiUrl]: config.apiUrl || DEFAULT_API_URL,
    [STORAGE_KEYS.token]: config.token || "",
  }
  if (hasChromeStorage()) {
    await chrome.storage.local.set(payload)
    return
  }
  localStorage.setItem(STORAGE_KEYS.apiUrl, payload[STORAGE_KEYS.apiUrl])
  localStorage.setItem(STORAGE_KEYS.token, payload[STORAGE_KEYS.token])
}
