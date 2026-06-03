/**
 * cv-autosave.ts — pure helpers for the living-master autosave (PR-3).
 *
 * Kept free of React/fetch so the dirty-tracking, draft-recovery, and status
 * logic can be unit-tested without a DOM. The hook (use-master-autosave) wires
 * these to debounced cv.saveMaster + the SE17 re-score poll.
 */
import type { CVStructured } from "@/lib/api"

export type SaveStatus = "idle" | "saving" | "saved" | "error"

const DRAFT_KEY_PREFIX = "myro-cv-master-draft-v1:"

/** localStorage key for a user's in-flight master draft (refresh recovery). */
export function masterDraftKey(userKey: string): string {
  return `${DRAFT_KEY_PREFIX}${userKey}`
}

/** Stable, field-order-insensitive comparison of two structured CVs. */
export function cvStructuredEqual(a: CVStructured | null, b: CVStructured | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return normalize(a) === normalize(b)
}

function normalize(cv: CVStructured): string {
  return JSON.stringify({
    summary: cv.summary ?? null,
    skills_line: cv.skills_line ?? null,
    certs: cv.certs ?? [],
    education: (cv.education ?? []).map((e) => [e.institution, e.degree, e.dates, e.grade, e.location]),
    experience: (cv.experience ?? []).map((e) => [e.company, e.role, e.dates, e.location, e.bullets]),
    projects: (cv.projects ?? []).map((p) => [p.name, p.dates, p.bullets]),
  })
}

/**
 * Choose the draft to hydrate the editor with. A persisted local draft that
 * differs from the server copy means the user edited and then reloaded/lost the
 * tab before the save landed → recover it. Otherwise trust the server.
 */
export function pickInitialDraft(
  server: CVStructured | null,
  persisted: CVStructured | null,
): CVStructured | null {
  if (!server) return persisted
  if (persisted && !cvStructuredEqual(server, persisted)) return persisted
  return server
}

/** Parse a persisted draft string, tolerating corruption (returns null). */
export function parsePersistedDraft(raw: string | null): CVStructured | null {
  if (!raw) return null
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === "object" && Array.isArray(obj.experience)) return obj as CVStructured
    return null
  } catch {
    return null
  }
}
