/**
 * Anon CV stash — bridges the pre-login "drop your CV → real score" preview to
 * the post-login account (grill Q8: ephemeral + browser-stash, claim on signup).
 *
 * Two halves, because a File is not serialisable:
 *   - the parsed RESULT goes to sessionStorage so it survives a signup REDIRECT
 *     (OAuth) — used for display continuity ("your preview scored 62, upload to
 *     save it") even when the original File is gone.
 *   - the File itself is held in a module variable. It survives in-SPA modal
 *     signup (email/password) so we can replay it to the authed upload with NO
 *     re-upload. A full-page OAuth redirect drops it → we fall back to the
 *     result-only continuity above.
 *
 * Nothing here ever persists the CV server-side — that's the whole PV1 point.
 */

import type { AnonScoreResponse } from "@/lib/api"

const RESULT_KEY = "myro_anon_score_v1"
// The COMPOSED CV text after the logged-out user's playground edits (hides +
// rewrites + a kept restructure). sessionStorage so it survives the signup
// redirect → claim-replay POSTs it to /cv/text as the new Main CV (grill Q8).
const COMPOSED_KEY = "myro_anon_cv_text_v1"

let stashedFile: File | null = null

export function stashAnonCv(file: File, result: AnonScoreResponse): void {
  stashedFile = file
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(result))
  } catch {
    // sessionStorage unavailable (private mode / quota) — the in-memory File
    // still covers the same-SPA replay; only cross-redirect continuity is lost.
  }
}

/** Consume the in-memory File for replay. Returns null after the first take or
 *  across a page reload. */
export function takeStashedFile(): File | null {
  const file = stashedFile
  stashedFile = null
  return file
}

export function readStashedResult(): AnonScoreResponse | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY)
    return raw ? (JSON.parse(raw) as AnonScoreResponse) : null
  } catch {
    return null
  }
}

/** Stash the composed CV text the user built in the pre-login playground.
 *  Replayed to /cv/text on signup so the IMPROVED CV becomes their Main CV. */
export function stashComposedCvText(text: string): void {
  try {
    sessionStorage.setItem(COMPOSED_KEY, text)
  } catch {
    // storage blocked — the save-on-signup path is then unavailable; the user
    // can still re-upload. Never throws into the playground.
  }
}

/** Consume the stashed composed text. Returns null when nothing was saved. */
export function takeStashedComposedCvText(): string | null {
  try {
    const text = sessionStorage.getItem(COMPOSED_KEY)
    if (text) sessionStorage.removeItem(COMPOSED_KEY)
    return text && text.trim() ? text : null
  } catch {
    return null
  }
}

export function clearAnonCvStash(): void {
  stashedFile = null
  try {
    sessionStorage.removeItem(RESULT_KEY)
    sessionStorage.removeItem(COMPOSED_KEY)
  } catch {
    // ignore
  }
}
