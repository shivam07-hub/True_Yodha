import test from "node:test"
import assert from "node:assert/strict"
import { entryView } from "../src/entry-view.js"

const WEB = "https://himyro.com"
const entry = (over = {}) => ({ job_id: "ext_abc", stage: "saved", title: "Partner Solution Sales", company: "Microsoft", ...over })

test("saved → tailor this job's CV", () => {
  const v = entryView(entry(), WEB)
  assert.equal(v.pill, "Saved")
  assert.equal(v.applyFirst, false)
  assert.deepEqual(v.next, { label: "Tailor your CV", href: `${WEB}/cv?jobId=ext_abc` })
})

test("tailored → I applied leads; the tailored CV sits under it", () => {
  const v = entryView(entry({ stage: "tailored" }), WEB)
  assert.equal(v.pill, "Tailored")
  assert.equal(v.applyFirst, true)
  assert.deepEqual(v.next, { label: "Open your tailored CV", href: `${WEB}/cv?jobId=ext_abc` })
})

test("an unanswered Apply click asks before a tailor", () => {
  const v = entryView(entry({ stage: "saved", pending_apply: true }), WEB)
  assert.equal(v.applyFirst, true)
  assert.equal(v.next.label, "Tailor your CV")
})

test("applied → prepare in the job's room, never asked again", () => {
  const v = entryView(entry({ stage: "applied", pending_apply: true }), WEB)
  assert.equal(v.pill, "Applied")
  assert.equal(v.applyFirst, false)
  assert.deepEqual(v.next, { label: "Prepare for this job", href: `${WEB}/preparations/ext_abc` })
})

test("the page's job is named from the server's entry, never a local copy", () => {
  const v = entryView(entry(), WEB)
  assert.equal(v.title, "Partner Solution Sales")
  assert.equal(v.company, "Microsoft")
})

test("only an extension import offers a details fix", () => {
  assert.equal(entryView(entry(), WEB).canFixDetails, true)
  assert.equal(entryView(entry({ job_id: "a1b2c3" }), WEB).canFixDetails, false)
})

test("ids are encoded into links", () => {
  assert.equal(entryView(entry({ job_id: "x/y" }), WEB).next.href, `${WEB}/cv?jobId=x%2Fy`)
})
