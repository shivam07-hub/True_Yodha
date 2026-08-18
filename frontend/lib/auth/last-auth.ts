const STORAGE_KEY = "myro_last_auth_v1"

export type AuthMethod = "google" | "linkedin" | "magic_link" | "password" | "partner"

export type HighlightableAuthMethod = "google" | "linkedin" | "magic_link" | "password"

export type LoginStackMethod = "google" | "linkedin" | "magic_link"

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface LastAuthRecord {
  method: AuthMethod
  email: string | null
}

const METHODS = new Set<AuthMethod>([
  "google",
  "linkedin",
  "magic_link",
  "password",
  "partner",
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX = 160

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function cleanEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? ""
  if (!value || value.length > EMAIL_MAX || !EMAIL_RE.test(value)) return null
  return value
}

function parseRecord(raw: string | null): LastAuthRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { method?: unknown; email?: unknown }
    if (typeof parsed.method !== "string" || !METHODS.has(parsed.method as AuthMethod)) {
      return null
    }
    return {
      method: parsed.method as AuthMethod,
      email: cleanEmail(typeof parsed.email === "string" ? parsed.email : null),
    }
  } catch {
    return null
  }
}

function readRecord(storage: StorageLike | null): LastAuthRecord | null {
  if (!storage) return null
  try {
    const record = parseRecord(storage.getItem(STORAGE_KEY))
    if (record) return record
    storage.removeItem(STORAGE_KEY)
    return null
  } catch {
    return null
  }
}

export function rememberAuth(
  method: AuthMethod,
  email?: string | null,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage || !METHODS.has(method)) return
  try {
    const record: LastAuthRecord = {
      method,
      email: cleanEmail(email),
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Private mode / quota — the hint is best-effort.
  }
}

export function readLastAuthMethod(
  storage: StorageLike | null = browserStorage(),
): AuthMethod | null {
  return readRecord(storage)?.method ?? null
}

export function readLastEmail(
  storage: StorageLike | null = browserStorage(),
): string | null {
  return readRecord(storage)?.email ?? null
}

export function isReturningDevice(
  storage: StorageLike | null = browserStorage(),
): boolean {
  return readRecord(storage) !== null
}

export function forgetDeviceAuth(
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Best-effort wipe.
  }
}

export function highlightableLastMethod(
  method: AuthMethod | null,
  opts: { inAppBrowser?: boolean } = {},
): HighlightableAuthMethod | null {
  if (!method || method === "partner") return null
  if (opts.inAppBrowser && method === "google") return "magic_link"
  return method
}

export function loginStackOrder(
  last: HighlightableAuthMethod | null,
): LoginStackMethod[] {
  const base: LoginStackMethod[] = ["google", "linkedin", "magic_link"]
  if (!last || last === "password") return base
  return [last, ...base.filter((method) => method !== last)]
}

export function methodFromCallback(input: {
  provider: string | null
  via?: string | null
}): AuthMethod {
  if (input.via) return "partner"
  const provider = (input.provider ?? "").toLowerCase()
  if (provider === "google") return "google"
  if (provider.startsWith("linkedin")) return "linkedin"
  return "magic_link"
}

export function publicAuthPrimary(returning: boolean): "signin" | "signup" {
  return returning ? "signin" : "signup"
}
