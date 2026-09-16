import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { nextReachAction, REACH_STATUS_LABEL } from "../lib/reach/labels"

const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8")

test("queued becomes mark sent; due follow-up is still a user tap", () => {
  assert.equal(nextReachAction("queued", false)?.action, "sent")
  assert.equal(nextReachAction("sent", false), null)
  assert.equal(nextReachAction("sent", true)?.action, "followed_up")
  assert.equal(nextReachAction("replied", false), null)
  assert.equal(REACH_STATUS_LABEL.queued, "Queued")
})

test("desk is wired from collections and the job reach surfaces", () => {
  assert.match(read("components/collections/collections-desktop.tsx"), /ReachDueStrip/)
  assert.match(read("mobile/redesign/collections-surface.tsx"), /ReachDueStrip/)
  assert.match(read("components/dashboard/reach-section.tsx"), /ReachLog/)
  assert.match(read("components/reach/reach-log.tsx"), /href=\{`\/reach\?jobId=/)
  assert.match(read("components/jobs/card-detail-rail.tsx"), /\/reach\?jobId=/)
  assert.match(read("app/(authed)/reach/page.tsx"), /ReachDesk/)
})

test("ADR-0018 Path 3 still forbids auto-send and scrape", () => {
  const adr = readFileSync(join(__dirname, "../../docs/adr/0018-myro-referral-intelligence.md"), "utf8")
  assert.match(adr, /Path 3/)
  assert.match(adr, /never sends the message/)
  assert.match(adr, /auto-DM/)
  assert.match(adr, /Still rejected/)
  assert.match(adr, /Consequences/)
  assert.match(adr, /GET\/POST \/jobs\/reach\/targets/)
})
