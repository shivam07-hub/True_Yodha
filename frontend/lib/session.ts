const ACCESS_TOKEN_KEY = "mirror_token"
const REFRESH_TOKEN_KEY = "mirror_refresh_token"
const REFRESH_LOCK_KEY = "mirror_refresh_lock"
// Persisted XP balance (zustand persist name in store/xpStore.ts). Wiped on
// logout so the next user in this tab never inherits a balance.
const XP_STORE_KEY = "myro_xp"
const SESSION_CHANGE_EVENT = "myro-session-change"

const DURABLE_KEYS = [
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  REFRESH_LOCK_KEY,
  XP_STORE_KEY,
] as const

export interface SessionTokens {
  accessToken: string
  refreshToken?: string | null
}

export interface TokenStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key?: (index: number) => string | null
  length?: number
}

/**
 * A same-origin tab opened from an in-app "browse while working" control gets
 * an initial, tab-scoped sessionStorage copy from its opener. Once that copy is
 * available, it no longer needs an opener relationship. Detach it before the
 * app becomes interactive so a later navigation cannot control the source tab.
 */
export function detachSameOriginOpener(): void {
  if (typeof window === "undefined" || !window.opener) return
  try {
    window.opener = null
  } catch {
    // A browser may make opener read-only. It is still only enabled for
    // first-party /market links, never an external destination.
  }
}

function durableStore(): TokenStorage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function tabStore(): TokenStorage | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function supabaseAuthKeys(store: TokenStorage): string[] {
  const length = store.length
  if (typeof store.key !== "function" || typeof length !== "number") return []
  const keys: string[] = []
  for (let index = 0; index < length; index += 1) {
    const key = store.key(index)
    if (key?.startsWith("sb-") && key.endsWith("-auth-token")) keys.push(key)
  }
  return keys
}

/**
 * Sessions used to live in sessionStorage, so closing the tab logged the user
 * out. Copy any leftover tab tokens into localStorage once, then drop the tab
 * copy so the two stores cannot disagree.
 */
export function migrateTabSessionToDurable(
  durable: TokenStorage,
  tab: TokenStorage,
): void {
  for (const key of DURABLE_KEYS) {
    const incoming = tab.getItem(key)
    if (!incoming) continue
    if (!durable.getItem(key)) durable.setItem(key, incoming)
    tab.removeItem(key)
  }
  for (const key of supabaseAuthKeys(tab)) {
    const incoming = tab.getItem(key)
    if (!incoming) continue
    if (!durable.getItem(key)) durable.setItem(key, incoming)
    tab.removeItem(key)
  }
}

let migrated = false

function ensureMigrated(): void {
  if (migrated) return
  const durable = durableStore()
  const tab = tabStore()
  if (!durable || !tab) return
  migrated = true
  try {
    migrateTabSessionToDurable(durable, tab)
  } catch {
    migrated = false
  }
}

function readStorage(key: string): string | null {
  ensureMigrated()
  try {
    const durable = durableStore()?.getItem(key) ?? null
    if (durable) return durable
  } catch {
    // Durable store blocked (private mode). Fall through to the tab.
  }
  try {
    return tabStore()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  ensureMigrated()
  const durable = durableStore()
  if (durable) {
    try {
      durable.setItem(key, value)
      tabStore()?.removeItem(key)
      return
    } catch {
      // Fall through to tab-scoped storage.
    }
  }
  try {
    tabStore()?.setItem(key, value)
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function removeStorage(key: string): void {
  try {
    durableStore()?.removeItem(key)
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
  try {
    tabStore()?.removeItem(key)
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
    for (const store of [durableStore(), tabStore()]) {
      if (!store) continue
      for (const key of supabaseAuthKeys(store)) {
        try {
          store.removeItem(key)
        } catch {
          // Best-effort wipe.
        }
      }
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
  if (typeof window === "undefined") return Promise.resolve(null)
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
