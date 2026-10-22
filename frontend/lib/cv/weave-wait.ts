/**
 * A weave the client stopped waiting on is not a failed weave.
 *
 * The run takes 20–75s and the socket gives up at 60s; the server keeps
 * working and charges on delivery. While it works it holds a claim on this
 * job, reported as `weaving` on GET /cv/weave/{job}, and refuses a second run
 * with `weave_in_flight`. So the client reads the GET until the proposal lands
 * or the run ends without one — never a Retry that pays for a second run
 * (U4 phone run, 2026-10-22).
 */
import { ApiError } from "../api-error"
import type { WeaveGetResponse } from "../api"

/** `detail.code` on the 409 a second run gets while the first is working. */
export const WEAVE_IN_FLIGHT = "weave_in_flight"

export const WEAVE_POLL_MS = 3_000

/** The client cannot know how the run ended: it timed out, the connection
 *  dropped, or the server says a run for this job is already working. */
export function weaveOutcomeUnseen(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  return err.kind !== "http" || err.code === WEAVE_IN_FLIGHT
}

export type WeaveWaitVerdict = "landed" | "working" | "failed"

export function weaveWaitVerdict(get: WeaveGetResponse): WeaveWaitVerdict {
  if (get.purchased && get.proposal && !get.stale) return "landed"
  if (get.weaving) return "working"
  return "failed"
}
