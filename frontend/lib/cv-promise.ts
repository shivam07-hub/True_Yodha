/* The 10-minute CV promise — North Star countdown anchor.
 *
 * Decision context: progressive-nav grill 2026-05-29 (Q4, hybrid C) +
 * [[project_ten_minute_cv_promise]]. The clock starts when the operator
 * commits to the journey (first CV upload), counts down 600s to their first
 * tailored CV, and on expiry flips to a gentle "FINISH CV" nudge — never shame.
 *
 * Server `cv_upload_jobs.created_at` (exposed as status.started_at) is the
 * source of truth; localStorage is the optimistic mirror so the pill renders
 * instantly before the first poll resolves, then reconciles to the server value.
 * The promise pill is first-run-only and vanishes once a tailored CV exists.
 */
const DEADLINE_KEY = "myro_cv_deadline_v1"
export const CV_PROMISE_SECONDS = 600

function read(): number | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(DEADLINE_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function write(deadlineMs: number): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(DEADLINE_KEY, String(deadlineMs))
  } catch {
    /* private-mode / quota — pill falls back to static promise, harmless */
  }
}

/** Current deadline epoch-ms, or null if the journey hasn't started. */
export function getCvDeadline(): number | null {
  return read()
}

/** Optimistically start the clock now (called the instant an upload begins). */
export function startCvPromiseOptimistic(): number {
  const existing = read()
  const now = Date.now()
  // Keep an existing live deadline; only (re)seed if absent or already expired/garbage.
  if (existing && existing > now && existing - now <= CV_PROMISE_SECONDS * 1000 + 2000) {
    return existing
  }
  const deadline = now + CV_PROMISE_SECONDS * 1000
  write(deadline)
  return deadline
}

/** Reconcile the deadline to the authoritative server job-creation timestamp. */
export function reconcileCvPromise(startedAtIso: string | null | undefined): void {
  if (!startedAtIso) return
  const started = Date.parse(startedAtIso)
  if (!Number.isFinite(started)) return
  write(started + CV_PROMISE_SECONDS * 1000)
}

/** Promise delivered (or abandoned) — clear the clock. */
export function clearCvPromise(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(DEADLINE_KEY)
  } catch {
    /* ignore */
  }
}
