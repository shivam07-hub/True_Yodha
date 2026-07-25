const ACCESS_TOKEN_KEY = "mirror_token"
const REFRESH_TOKEN_KEY = "mirror_refresh_token"
const REFRESH_LOCK_KEY = "mirror_refresh_lock"
// Persisted XP balance (zustand persist name in store/xpStore.ts). Wiped on
// logout so the next user in this tab never inherits a balance.
const XP_STORE_KEY = "myro_xp"
const SESSION_CHANGE_EVENT = "myro-session-change"

export interface SessionTokens {
  accessToken: string
  refreshToken?: string | null
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
}

function readStorage(key: string): string | null {
  if (!hasStorage()) return null
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  if (!hasStorage()) return
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function removeStorage(key: string): void {
  if (!hasStorage()) return
  try {
    window.sessionStorage.removeItem(key)
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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: accessToken }))
  }
}

export function clearSessionTokens(): void {
  removeStorage(ACCESS_TOKEN_KEY)
  removeStorage(REFRESH_TOKEN_KEY)
  removeStorage(XP_STORE_KEY)
  if (typeof window !== "undefined") {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index)
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) removeStorage(key)
    }
    window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: null }))
  }
}

export function subscribeToSessionChanges(handler: (token: string | null) => void): () => void {
  if (typeof window === "undefined") return () => undefined
  const listener = (event: Event) => {
    handler((event as CustomEvent<string | null>).detail ?? null)
  }
  window.addEventListener(SESSION_CHANGE_EVENT, listener)
  return () => window.removeEventListener(SESSION_CHANGE_EVENT, listener)
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
  const original = getAccessToken()
  return new Promise((resolve) => {
    const poll = window.setInterval(() => {
      const current = getAccessToken()
      if (current && current !== original) finish(current)
    }, 50)
    const finish = (value: string | null) => {
      window.clearInterval(poll)
      window.clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      finish(null)
    }, ttlMs)
  })
}
