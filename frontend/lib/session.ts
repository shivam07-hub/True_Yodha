const ACCESS_TOKEN_KEY = "mirror_token"
const REFRESH_TOKEN_KEY = "mirror_refresh_token"
const REFRESH_LOCK_KEY = "mirror_refresh_lock"

export interface SessionTokens {
  accessToken: string
  refreshToken?: string | null
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function readStorage(key: string): string | null {
  if (!hasStorage()) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function removeStorage(key: string): void {
  if (!hasStorage()) return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

export function getAccessToken(): string | null {
  return readStorage(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return readStorage(REFRESH_TOKEN_KEY)
}

export function setSessionTokens({ accessToken, refreshToken }: SessionTokens): void {
  writeStorage(ACCESS_TOKEN_KEY, accessToken)
  if (refreshToken) writeStorage(REFRESH_TOKEN_KEY, refreshToken)
  else removeStorage(REFRESH_TOKEN_KEY)
}

export function clearSessionTokens(): void {
  removeStorage(ACCESS_TOKEN_KEY)
  removeStorage(REFRESH_TOKEN_KEY)
}

export function acquireRefreshLock(ttlMs: number): boolean {
  try {
    const val = readStorage(REFRESH_LOCK_KEY)
    if (val && Date.now() - parseInt(val, 10) < ttlMs) return false
    writeStorage(REFRESH_LOCK_KEY, String(Date.now()))
    return true
  } catch {
    return true
  }
}

export function releaseRefreshLock(): void {
  removeStorage(REFRESH_LOCK_KEY)
}

export function waitForAccessTokenChange(ttlMs: number): Promise<string | null> {
  if (!hasStorage()) return Promise.resolve(null)
  return new Promise((resolve) => {
    const handler = (e: StorageEvent) => {
      if (e.key === ACCESS_TOKEN_KEY && e.newValue) {
        window.removeEventListener("storage", handler)
        clearTimeout(timer)
        resolve(e.newValue)
      }
    }
    const timer = setTimeout(() => {
      window.removeEventListener("storage", handler)
      resolve(null)
    }, ttlMs)
    window.addEventListener("storage", handler)
  })
}
