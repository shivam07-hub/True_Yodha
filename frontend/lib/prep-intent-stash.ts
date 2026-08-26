/**
 * Preparation-intent stash — bridges "a reader arrived from a newsletter issue
 * that ended in skills to practise" to the post-login account. Fourth
 * carried-intent lane, mirroring the anon-CV claim, the anon job save and the
 * extension handshake.
 *
 * Why this exists: every skills-led issue closes by naming the skills a city's
 * employers ask for, then sends the reader to go practise them. Without a
 * carried intent that reader lands on /market (or /onboarding on first signup)
 * and has to find Preparation on their own, which loses the one thing the issue
 * was for.
 *
 * WHAT IS STORED IS A MARKER, NEVER A URL. postAuthDestination's contract is
 * that the landing is keyed on intent and never on a destination the caller
 * asked for (Shivam, 2026-07-11); a `?next=` style return stays deleted. This
 * stash holds a single fixed token and the destination is hardcoded in
 * postAuthDestination, so a crafted `?intent=https://evil.example` or a
 * hand-edited sessionStorage value cannot route anywhere at all.
 */

const KEY = "myro_pending_prep_intent_v1"

/** The only legal value. Anything else is ignored on write and on read. */
const MARKER = "preparations"

/** Query-param value that opts a visitor into this lane: `?intent=prep`. */
export const PREP_INTENT_PARAM = "prep"

/** Stash the intent when a visitor lands on an auth route from a skills issue. */
export function stashPendingPrepIntent(): void {
  try {
    sessionStorage.setItem(KEY, MARKER)
  } catch {
    // sessionStorage unavailable (private mode / quota) — the visitor lands on
    // the default surface, i.e. the behaviour before this lane existed.
  }
}

/** Read without clearing — used by postAuthDestination to pick the landing. */
export function hasPendingPrepIntent(): boolean {
  try {
    return sessionStorage.getItem(KEY) === MARKER
  } catch {
    return false
  }
}

/** Clear once the landing has been used, so a later login is unaffected. */
export function clearPendingPrepIntent(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore — a stale marker at worst re-lands the user on Preparation.
  }
}

/** Capture `?intent=prep` off an auth route. No-op for any other value. */
export function capturePrepIntentParam(intent: string | null): void {
  if (intent === PREP_INTENT_PARAM) stashPendingPrepIntent()
}
