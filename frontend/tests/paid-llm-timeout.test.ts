import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

// A paid call the client stops waiting on is not a failed call: the server
// keeps working, charges on delivery and caches the result, while the card
// says it failed (BACKLOG FD4, the weave). The outreach pack and the day-of
// brief are LLM calls — the brief can be two — so they wait as long as the
// weave and polish do, not the 15s read default.
const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8")

function callBlock(signature: string): string {
  const start = api.indexOf(signature)
  assert.ok(start > 0, `${signature} moved — point this test at it`)
  return api.slice(start, api.indexOf("\n    }),", start))
}

for (const signature of [
  "createReachPack: (token: string, jobId: string)",
  "createPrepBrief: (token: string, jobId: string)",
]) {
  test(`${signature.split(":")[0]} waits as long as the model does`, () => {
    const block = callBlock(signature)
    assert.match(block, /method: "POST"/)
    assert.match(block, /timeoutMs: LLM_REQUEST_TIMEOUT_MS/)
  })
}
