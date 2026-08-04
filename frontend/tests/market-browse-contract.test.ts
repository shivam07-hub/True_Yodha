import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { interleaveStories } from "../components/market/feed-rows"
import type { JobFeedItem } from "../lib/api"

const jobs = ["exact", "remote", "country"].map((job_id) => ({ job_id } as JobFeedItem))

test("location expansion dividers sit before their first broader job", () => {
  const rows = interleaveStories(jobs, [], [
    { beforeJobId: "remote", label: "More remote roles in India" },
    { beforeJobId: "country", label: "More roles in India" },
  ])
  assert.deepEqual(rows.map((row) => row.t), ["job", "divider", "job", "divider", "job"])
  assert.equal(rows[1]?.t === "divider" && rows[1].label, "More remote roles in India")
})

test("browse expansion and Undo follow the locked contract", () => {
  const hook = readFileSync(new URL("../components/market/use-job-feed.ts", import.meta.url), "utf8")
  const css = readFileSync(new URL("../components/market/market.css", import.meta.url), "utf8")
  assert.match(hook, /exact: "remote_country"/)
  assert.match(hook, /remote_country: "country"/)
  assert.match(hook, /const UNDO_MS = 6000/)
  assert.match(css, /bottom: calc\(env\(safe-area-inset-bottom, 0px\) \+ 24px\)/)
  assert.match(css, /\+ 84px/)
})

test("Not interested is persistent and recoverable", () => {
  const card = readFileSync(new URL("../components/market/job-card.tsx", import.meta.url), "utf8")
  const hidden = readFileSync(new URL("../components/market/hidden-jobs-dialog.tsx", import.meta.url), "utf8")
  assert.match(card, /Not interested/)
  assert.match(hidden, /Hidden jobs/)
  assert.match(hidden, /jobs\.unskipJob/)
})

test("new-tab job browsing retains the same-origin session", () => {
  const browseControls = [
    "components/onboarding/analysis-progress.tsx",
    "components/onboarding/experience-step.tsx",
    "components/cv/cv-structured-recovery.tsx",
  ].map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))

  for (const control of browseControls) {
    assert.match(control, /href=\"\/market\"/)
    assert.match(control, /target=\"_blank\"/)
    assert.match(control, /rel=\"opener\"/)
    assert.doesNotMatch(control, /rel=\"noopener noreferrer\"/)
  }

  const session = readFileSync(new URL("../lib/session.ts", import.meta.url), "utf8")
  const auth = readFileSync(new URL("../lib/hooks/use-auth.ts", import.meta.url), "utf8")
  assert.match(session, /window\.opener = null/)
  assert.match(auth, /detachSameOriginOpener\(\)/)
})
