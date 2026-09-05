const STORAGE_KEY = "myro_last_auth_v1"

export type AuthMethod = "google" | "linkedin" | "magic_link" | "password" | "partner"

export type HighlightableAuthMethod = "google" | "linkedin" | "magic_link" | "password"

export type LoginStackMethod = "google" | "linkedin" | "magic_link"

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * Who used this device last — method AND person. The method alone only ever
 * bought a "Last used" badge; the name and face are what let the login screen
 * greet someone instead of asking who they are.
 */
export interface LastAuthRecord {
  method: AuthMethod
  email: string | null
  name: string | null
  avatar: string | null
}

export interface RememberOptions {
  name?: string | null
  avatar?: string | null
  storage?: StorageLike | null
}

const METHODS = new Set<AuthMethod>([
  "google",
  "linkedin",
  "magic_link",
  "password",
  "partner",
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CONTROL_RE = /[\u0000-\u001f\u007f]/g
const EMAIL_MAX = 160
const NAME_MAX = 60
const AVATAR_MAX = 512

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function resolveStorage(storage: StorageLike | null | undefined): StorageLike | null {
  return storage === undefined ? browserStorage() : storage
}

function cleanEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? ""
  if (!value || value.length > EMAIL_MAX || !EMAIL_RE.test(value)) return null
  return value
}

/**
 * A display name arrives from an OAuth provider, so it is user-authored text
 * rendered back on a public screen. Collapse whitespace, drop control
 * characters, cap the length — a 4KB "name" is not a name.
 */
function cleanName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null
  const value = name.replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim()
  if (!value) return null
  return value.slice(0, NAME_MAX)
}

/**
 * Only an https URL ever reaches an <img src>. Provider avatars are all https
 * CDN links; anything else on this key came from somewhere we do not control.
 */
function cleanAvatar(avatar: string | null | undefined): string | null {
  if (typeof avatar !== "string") return null
  const value = avatar.trim()
  if (!value || value.length > AVATAR_MAX) return null
  try {
    if (new URL(value).protocol !== "https:") return null
  } catch {
    return null
  }
  return value
}

function parseRecord(raw: string | null): LastAuthRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as {
      method?: unknown
      email?: unknown
      name?: unknown
      avatar?: unknown
    }
    if (typeof parsed.method !== "string" || !METHODS.has(parsed.method as AuthMethod)) {
      return null
    }
    return {
      method: parsed.method as AuthMethod,
      email: cleanEmail(typeof parsed.email === "string" ? parsed.email : null),
      name: cleanName(typeof parsed.name === "string" ? parsed.name : null),
      avatar: cleanAvatar(typeof parsed.avatar === "string" ? parsed.avatar : null),
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
  opts: RememberOptions = {},
): void {
  const storage = resolveStorage(opts.storage)
  if (!storage || !METHODS.has(method)) return
  const nextEmail = cleanEmail(email)
  const previous = readRecord(storage)
  // A password sign-in carries no display name — the API answers with tokens,
  // not a profile. Absent is not cleared: when the address is the one already
  // on this device, keep the face learned from the OAuth path instead of
  // demoting a known person back to an email string.
  const samePerson = previous !== null && nextEmail !== null && previous.email === nextEmail
  try {
    const record: LastAuthRecord = {
      method,
      email: nextEmail,
      name: cleanName(opts.name) ?? (samePerson ? previous.name : null),
      avatar: cleanAvatar(opts.avatar) ?? (samePerson ? previous.avatar : null),
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Private mode / quota — the hint is best-effort.
  }
}

export function readLastIdentity(
  storage: StorageLike | null = browserStorage(),
): LastAuthRecord | null {
  return readRecord(storage)
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

export interface GreetableIdentity {
  method: HighlightableAuthMethod
  email: string
  name: string | null
  avatar: string | null
}

/**
 * The greeting needs a method to continue WITH and an address to greet. A
 * partner SSO seat has no button on this screen, and a record with no email
 * cannot be attributed to a person, so neither one opens the card.
 */
export function greetableIdentity(
  record: LastAuthRecord | null,
  opts: { inAppBrowser?: boolean } = {},
): GreetableIdentity | null {
  if (!record?.email) return null
  const method = highlightableLastMethod(record.method, opts)
  if (!method) return null
  return { method, email: record.email, name: record.name, avatar: record.avatar }
}

/**
 * Pull the person out of a Supabase session user. Google answers with
 * `full_name`/`picture`, LinkedIn OIDC with `name`/`avatar_url`, and a magic
 * link with neither — so every field is optional and nothing is invented.
 */
export function identityFromUserMetadata(
  metadata: unknown,
): { name: string | null; avatar: string | null } {
  const meta = (metadata ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = meta[key]
      if (typeof value === "string" && value.trim()) return value
    }
    return null
  }
  return {
    name: pick("full_name", "name", "preferred_username"),
    avatar: pick("avatar_url", "picture"),
  }
}

/** First letter of the name, else of the address. Never empty, never two. */
export function identityInitial(name: string | null, email: string): string {
  const source = (name ?? email).trim()
  return (source[0] ?? "?").toUpperCase()
}

export function loginStackOrder(
  last: HighlightableAuthMethod | null,
): LoginStackMethod[] {
  const base: LoginStackMethod[] = ["google", "linkedin", "magic_link"]
  if (!last || last === "password") return base
  return [last, ...base.filter((method) => method !== last)]
}

/**
 * Which method just signed this person in.
 *
 * The marker is the caller's own statement and outranks the session, because
 * the session cannot answer the question: `app_metadata.provider` names the
 * FIRST provider an account ever used, and for an account with both an email
 * and a Google identity that read "email" straight after a Google One Tap
 * sign-in. Provider inference stays as the fallback for links minted before
 * the marker existed.
 */
export function methodFromCallback(input: {
  provider: string | null
  via?: string | null
  marker?: string | null
}): AuthMethod {
  if (input.via) return "partner"
  const marker = (input.marker ?? "").trim().toLowerCase()
  if (marker && marker !== "partner" && METHODS.has(marker as AuthMethod)) {
    return marker as AuthMethod
  }
  const provider = (input.provider ?? "").toLowerCase()
  if (provider === "google") return "google"
  if (provider.startsWith("linkedin")) return "linkedin"
  return "magic_link"
}

export function publicAuthPrimary(returning: boolean): "signin" | "signup" {
  return returning ? "signin" : "signup"
}
