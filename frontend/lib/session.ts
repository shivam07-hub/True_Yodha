const ACCESS_TOKEN_KEY = "mirror_token"
const REFRESH_TOKEN_KEY = "mirror_refresh_token"
const REFRESH_LOCK_KEY = "mirror_refresh_lock"
// Keep in sync with RQ_CACHE_KEY in lib/query-persist.ts. Inlined (not imported)
// to keep the persister package out of this low-level, widely-imported module.
const RQ_CACHE_KEY = "myro_rq_cache"
// Persisted XP balance (zustand persist name in store/xpStore.ts). Wiped on
// logout so the next user on a shared browser never inherits a balance.
const XP_STORE_KEY = "myro_xp"

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
  // Drop the persisted query cache too — it holds this user's dashboard data,
  // and the next person on a shared browser must not inherit it.
  removeStorage(RQ_CACHE_KEY)
  removeStorage(XP_STORE_KEY)
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
