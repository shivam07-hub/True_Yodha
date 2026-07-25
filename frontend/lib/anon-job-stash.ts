/**
 * Anon job-save stash — bridges "logged-out user clicks Save on a job card" to
 * the post-login account (Exception 2, 2026-07-11). Mirrors the anon-CV claim:
 * the intent is held browser-local, then replayed against the real API once the
 * user has a token, so signing up from a job card saves that job and lands the
 * user on Collections — no "where did my job go?" surprise.
 *
 * Only a job_id needs to survive, so sessionStorage (survives the OAuth full-page
 * redirect) holds it directly. Server persistence happens after auth via the
 * explicit claim flow (usePendingJobSaveClaim).
 */

const KEY = "myro_pending_job_save_v1"

/** Stash the job the anon user tried to save, before opening the signup gate. */
export function stashPendingJobSave(jobId: string): void {
  if (!jobId) return
  try {
    sessionStorage.setItem(KEY, jobId)
  } catch {
    // sessionStorage unavailable (private mode / quota) — the save is best-effort;
    // the user still lands on Collections and can re-save from Jobs.
  }
}

/** Read without clearing — used by postAuthDestination to pick the landing. */
export function readPendingJobSave(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Read + clear — used by the claim replay so it fires exactly once. */
export function takePendingJobSave(): string | null {
  const jobId = readPendingJobSave()
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore — the replay guards on token; a stale key at worst re-saves (idempotent).
  }
  return jobId
}

/** Whether a job save is pending — drives the /collections landing exception. */
export function hasPendingJobSaveClaim(): boolean {
  return readPendingJobSave() !== null
}
