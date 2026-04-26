const ACCESS_TOKEN_KEY = "mirror_token"
const REFRESH_TOKEN_KEY = "mirror_refresh_token"

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
