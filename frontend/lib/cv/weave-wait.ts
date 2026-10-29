/**
 * When a weave the client stopped waiting on has ended (`lib/run-wait.ts`).
 *
 * A refresh keeps the old draft in the cache while it runs, so a proposal
 * alone is not a landing: it must be current.
 */
import type { WeaveGetResponse } from "../api"
import type { RunWaitVerdict } from "../run-wait"

export function weaveWaitVerdict(get: WeaveGetResponse): RunWaitVerdict {
  if (get.purchased && get.proposal && !get.stale) return "landed"
  if (get.weaving) return "working"
  return "failed"
}
