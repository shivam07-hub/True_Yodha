/**
 * Am I inside the Android app?
 *
 * Two signals: the TWA opens on `?shell=android`, and Android sets
 * `document.referrer` to `android-app://com.himyro.app` when the app follows
 * a link. The before-paint script in `cold-open.ts` is the other reader, so a
 * logged-out Jobs open can leave before this module loads. It must agree with
 * `referrerIsAndroidApp`.
 *
 * Remembered in sessionStorage only. A TWA shares the phone's longer-lived
 * storage and its cookies with Chrome, so a flag kept past this tab would
 * hide buying in that person's ordinary browser tabs too.
 *
 * The React hook lives in `use-android-app.ts`. This module is imported by
 * `lib/api.ts`, which server routes import, so it cannot pull in a client hook.
 */
export const SHELL_KEY = "myro-app-shell"
export const ANDROID_APP_REFERRER = "android-app://com.himyro.app"

export type AppShell = "web" | "android"

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function referrerIsAndroidApp(referrer: string): boolean {
  if (!referrer.startsWith(ANDROID_APP_REFERRER)) return false
  const next = referrer.charAt(ANDROID_APP_REFERRER.length)
  return next === "" || next === "/" || next === "?" || next === "#"
}

function remembered(storage: StorageLike | null): boolean {
  if (!storage) return false
  try {
    return storage.getItem(SHELL_KEY) === "android"
  } catch {
    return false
  }
}

function remember(storage: StorageLike | null): void {
  if (!storage) return
  try {
    storage.setItem(SHELL_KEY, "android")
  } catch {
    /* private mode — this load still counts, the next one may not */
  }
}

/** The shell for this load. Writes `android` into the session when either
 *  signal is present, so a later reload in the same tab still reads it. */
export function readAppShell(input: {
  search: string
  referrer: string
  storage: StorageLike | null
}): AppShell {
  if (remembered(input.storage)) return "android"
  const fromQuery = new URLSearchParams(input.search).get("shell") === "android"
  const fromReferrer = referrerIsAndroidApp(input.referrer)
  if (!fromQuery && !fromReferrer) return "web"
  remember(input.storage)
  return "android"
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function appShell(): AppShell {
  if (typeof window === "undefined") return "web"
  return readAppShell({
    search: window.location.search,
    referrer: document.referrer,
    storage: browserStorage(),
  })
}

export function isAndroidApp(): boolean {
  return appShell() === "android"
}

// Capture on the first client evaluation, before a navigation drops
// `?shell=android`. A server import sees no window and does nothing.
if (typeof window !== "undefined") isAndroidApp()
