/**
 * A paid run the client stopped waiting on is waited on, never failed or re-run.
 *
 * The outreach pack (50) and the day-of brief (30) carried the weave's FD4
 * race: a Retry after the 60s socket gave up, while the server was still
 * working, built and charged a second time. The server now holds one run per
 * job and refuses a second with `run_in_flight`; the client reads the GET's
 * `building` until the artifact lands or the run stops.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { ApiError } from "../lib/api-error"
import { RUN_IN_FLIGHT, purchaseWaitVerdict, runOutcomeUnseen } from "../lib/run-wait"

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

test("a timeout, a dropped connection or a run in flight is an outcome not seen", () => {
  assert.equal(runOutcomeUnseen(new ApiError("Request timed out.", { kind: "timeout" })), true)
  assert.equal(runOutcomeUnseen(new ApiError("Network request failed.", { kind: "network" })), true)
  assert.equal(runOutcomeUnseen(new ApiError("Offline.", { kind: "offline" })), true)
  assert.equal(runOutcomeUnseen(new ApiError("Still drafting", { kind: "http", status: 409, code: RUN_IN_FLIGHT })), true)
  // The server said how it ended: a 503 kept the coins, a 402 never started.
  assert.equal(runOutcomeUnseen(new ApiError("you were not charged.", { kind: "http", status: 503 })), false)
  assert.equal(runOutcomeUnseen(new ApiError("Not enough coins.", { kind: "http", status: 402 })), false)
  assert.equal(runOutcomeUnseen(new ApiError("Upload a CV first.", { kind: "http", status: 409 })), false)
  assert.equal(runOutcomeUnseen(new Error("boom")), false)
})

test("the wait ends only on a purchase or a run that stopped", () => {
  assert.equal(purchaseWaitVerdict({ purchased: false, building: true }), "working")
  assert.equal(purchaseWaitVerdict({ purchased: true, building: false }), "landed")
  // Cached a moment before the claim was released: the pack is there.
  assert.equal(purchaseWaitVerdict({ purchased: true, building: true }), "landed")
  assert.equal(purchaseWaitVerdict({ purchased: false, building: false }), "failed")
  // A server that predates the claim never says it is building.
  assert.equal(purchaseWaitVerdict({ purchased: false }), "failed")
})

test("the wait reads into the surface's own entry, every few seconds, never retried", () => {
  const hook = code(read("lib/hooks/use-run-wait.ts"))
  assert.match(hook, /client\.setQueryData\(\[entry, jobId\], poll\.data\)/)
  assert.match(hook, /refetchInterval: RUN_POLL_MS/)
  assert.match(hook, /retry: false/)
})

for (const [path, entry, read_] of [
  ["components/dashboard/reach-section.tsx", "reach-pack", "getReachPack"],
  ["components/preparations/brief-card.tsx", "prep-brief", "getPrepBrief"],
] as const) {
  test(`${path.split("/").pop()} waits on a run it did not see end instead of offering a Retry`, () => {
    const src = code(read(path))
    assert.match(src, new RegExp(`entry: "${entry}"`))
    assert.match(src, new RegExp(`read: \\(\\) => jobsApi\\.${read_}\\(`))
    assert.match(src, /verdict: purchaseWaitVerdict/)
    assert.match(src, /if \(runOutcomeUnseen\(e\)\) startWait\(\)\s*else setFailed\(/)
    // A run already working when the surface opens (reload, second tab).
    assert.match(src, /if \(buildingNow && !wait\.waiting\) startWait\(\)/)
    // The buy control stays busy for the whole wait, not just the socket.
    assert.match(src, /= buy\.isPending \|\| wait\.waiting/)
    assert.doesNotMatch(src, /buy\.isError/)
  })
}
