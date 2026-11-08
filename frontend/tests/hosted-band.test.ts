import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { visibleLanes } from "../components/market/feed-types"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

test("Apply here appears only when one is live, and never strands him on it", () => {
  assert.deepEqual(visibleLanes("jobs", false).map(([l]) => l), ["jobs", "internships"])
  assert.deepEqual(visibleLanes("jobs", true).map(([l]) => l), ["jobs", "internships", "hosted"])
  assert.deepEqual(visibleLanes("hosted", false).map(([l]) => l), ["jobs", "internships", "hosted"])
})

test("both skins show the internships band above the judged list, and gate the lane on it", () => {
  for (const skin of ["components/market/market-jobs-column.tsx", "mobile/redesign/jobs-surface.tsx"]) {
    const text = read(skin)
    assert.match(text, /<HostedBand token=\{token\} \/>/, skin)
    assert.match(text, /showHosted=\{hosted\.total > 0\}/, skin)
  }
})

test("the judged list stays judge-only: internships never enter the feed rows", () => {
  // /jobs/feed is score >= 3.5 by contract. The band reads its own endpoint.
  const hook = read("components/market/use-job-feed.ts")
  assert.doesNotMatch(hook, /internshipsForYou/)
})
