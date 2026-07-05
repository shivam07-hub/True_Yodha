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
 * This module only keeps browser-local pending data. Server persistence happens
 * later, after auth, through the explicit claim flow.
 */

import type { AnonScoreResponse } from "@/lib/api"
import { renderDeterministic } from "@/lib/cv-compose"

const RESULT_KEY = "myro_anon_score_v1"
// The COMPOSED CV text after the logged-out user's playground edits (hides +
// rewrites + a kept restructure). sessionStorage so it survives the signup
// redirect → claim-replay POSTs it to /cv/text as the new Main CV (grill Q8).
const COMPOSED_KEY = "myro_anon_cv_text_v1"

let stashedFile: File | null = null
let stashedText: string | null = null

/** Stash pasted CV text before scoring (navigate-then-load paste path, #4): the
 *  landing dropzone holds the text in-memory and jumps to /cv-preview, which
 *  scores it. Mirrors stashAnonCvFile; clears any stale prior result. */
export function stashAnonCvText(text: string): void {
  stashedText = text
  stashedFile = null
  try {
    sessionStorage.removeItem(RESULT_KEY)
    sessionStorage.removeItem(COMPOSED_KEY)
  } catch {
    // ignore — destination still finds the in-memory text to score.
  }
}

/** Consume the in-memory pasted text for scoring. Returns null after the first
 *  take or across a page reload. */
export function takeStashedText(): string | null {
  const text = stashedText
  stashedText = null
  return text
}

export function stashAnonCv(file: File, result: AnonScoreResponse): void {
  stashedFile = file
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(result))
    if (result.cv) sessionStorage.setItem(COMPOSED_KEY, renderDeterministic(result.cv, new Set()))
    else sessionStorage.removeItem(COMPOSED_KEY)
  } catch {
    // sessionStorage unavailable (private mode / quota) — the in-memory File
    // still covers the same-SPA replay; only cross-redirect continuity is lost.
  }
}

/** Stash just the File before scoring (navigate-then-load): the landing
 *  dropzone holds the File in-memory and jumps to /cv-preview, which scores it
 *  and re-stashes the full result. The File survives the in-SPA push (module
 *  variable); a stale prior result is cleared so the destination scores fresh. */
export function stashAnonCvFile(file: File): void {
  stashedFile = file
  try {
    sessionStorage.removeItem(RESULT_KEY)
    sessionStorage.removeItem(COMPOSED_KEY)
  } catch {
    // ignore — destination still finds the in-memory File to score.
  }
}

/** Consume the in-memory File for replay. Returns null after the first take or
 *  across a page reload. */
export function takeStashedFile(): File | null {
  const file = stashedFile
  stashedFile = null
  return file
}

export function hasStashedFile(): boolean {
  return stashedFile !== null
}

/** Stash just the RESULT (paste path, #4 — there's no File to replay). Keeps the
 *  score readout alive across the signup redirect / back-nav; claim-on-signup
 *  uses the composed text (stashComposedCvText) instead of a File. */
export function stashAnonCvResult(result: AnonScoreResponse): void {
  stashedFile = null
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(result))
    if (!result.cv) sessionStorage.removeItem(COMPOSED_KEY)
  } catch {
    // storage blocked — the in-SPA result state still renders; only cross-
    // redirect continuity is lost.
  }
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

export function readStashedComposedCvText(): string | null {
  try {
    const text = sessionStorage.getItem(COMPOSED_KEY)
    return text && text.trim() ? text : null
  } catch {
    return null
  }
}

export function clearAnonCvStash(): void {
  stashedFile = null
  stashedText = null
  try {
    sessionStorage.removeItem(RESULT_KEY)
    sessionStorage.removeItem(COMPOSED_KEY)
  } catch {
    // ignore
  }
}
