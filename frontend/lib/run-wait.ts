/**
 * A paid run the client stopped waiting on is not a failed run.
 *
 * The weave, the outreach pack and the day-of brief each run a provider ladder
 * that can outlast the socket's 60s; the server keeps working and charges on
 * delivery. While it works it holds a claim on the job (`services/paid_run.py`),
 * reported on the route's GET (the weave's `weaving`, the pack's and the
 * brief's `building`), and refuses a second run with `run_in_flight`. So the
 * client reads the GET until the artifact lands or the run ends without one —
 * never a Retry that pays for a second run (U4 phone run, 2026-10-22).
 */
import { ApiError } from "./api-error"

/** `detail.code` on the 409 a second run gets while the first is working. */
export const RUN_IN_FLIGHT = "run_in_flight"

export const RUN_POLL_MS = 3_000

/** The client cannot know how the run ended: it timed out, the connection
 *  dropped, or the server says a run for this job is already working. */
export function runOutcomeUnseen(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  return err.kind !== "http" || err.code === RUN_IN_FLIGHT
}

export type RunWaitVerdict = "landed" | "working" | "failed"

/** A pack or a brief is bought once and replayed free: purchased is landed. */
export function purchaseWaitVerdict(get: { purchased: boolean; building?: boolean }): RunWaitVerdict {
  if (get.purchased) return "landed"
  if (get.building) return "working"
  return "failed"
}
