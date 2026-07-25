/**
 * Referral capture helper.
 *
 * Reads `?ref=` from the current URL on first paint, persists it both as a
 * cookie (`myro_ref`, 30d) and in sessionStorage as a cross-origin fallback,
 * and returns the value so it can be echoed to `/auth/signup` as a body
 * field. Cross-origin CORS strips cookies on the actual signup POST, hence
 * the body echo.
 */

const COOKIE = "myro_ref"
const TTL_DAYS = 30
const STORAGE_KEY = "myro_ref"
const NAME_RE = /^[a-z0-9-]{3,32}$/

export function readRefFromUrl(): string | null {
  if (typeof window === "undefined") return null
  try {
    const params = new URLSearchParams(window.location.search)
    const ref = (params.get("ref") || "").trim().toLowerCase()
    return NAME_RE.test(ref) ? ref : null
  } catch {
    return null
  }
}

function setCookie(value: string): void {
  if (typeof document === "undefined") return
  const maxAge = TTL_DAYS * 24 * 60 * 60
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  // This cookie is a user-chosen public referral slug, not an auth credential.
  // JavaScript must read it to bridge the cross-origin signup request, so it
  // intentionally cannot be HttpOnly.
  document.cookie = `${COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
}

function readCookie(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`))
  if (!match) return null
  try {
    const v = decodeURIComponent(match[1])
    return NAME_RE.test(v) ? v : null
  } catch {
    return null
  }
}

export function persistReferral(ref: string): void {
  if (!NAME_RE.test(ref)) return
  setCookie(ref)
  try {
    window.sessionStorage.setItem(STORAGE_KEY, ref)
  } catch {
    // Ignore restricted storage contexts.
  }
}

export function getStoredReferral(): string | null {
  const cookie = readCookie()
  if (cookie) return cookie
  if (typeof window === "undefined") return null
  try {
    const local = window.sessionStorage.getItem(STORAGE_KEY)
    return local && NAME_RE.test(local) ? local : null
  } catch {
    return null
  }
}

export function capturePendingReferral(): string | null {
  const fromUrl = readRefFromUrl()
  if (fromUrl) {
    persistReferral(fromUrl)
    return fromUrl
  }
  return getStoredReferral()
}
