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

export function clearAnonCvStash(): void {
  stashedFile = null
  try {
    sessionStorage.removeItem(RESULT_KEY)
  } catch {
    // ignore
  }
}
