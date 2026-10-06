import test from "node:test"
import assert from "node:assert/strict"
import { entryView } from "../src/entry-view.js"

const WEB = "https://himyro.com"
const entry = (over = {}) => ({ job_id: "ext_abc", stage: "saved", title: "Partner Solution Sales", company: "Microsoft", ...over })

test("saved → tailor this job's CV", () => {
  const v = entryView(entry(), WEB)
  assert.equal(v.pill, "Saved")
  assert.deepEqual(v.primary, { label: "Tailor your CV", href: `${WEB}/cv?jobId=ext_abc` })
})

test("tailored → the tailored CV, not a second tailor", () => {
  const v = entryView(entry({ stage: "tailored" }), WEB)
  assert.equal(v.pill, "Tailored")
  assert.equal(v.primary.href, `${WEB}/cv?jobId=ext_abc`)
  assert.equal(v.primary.label, "Open your tailored CV")
})

test("applied → prepare in the job's room", () => {
  const v = entryView(entry({ stage: "applied" }), WEB)
  assert.equal(v.pill, "Applied")
  assert.deepEqual(v.primary, { label: "Prepare for this job", href: `${WEB}/preparations/ext_abc` })
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
  assert.equal(entryView(entry({ job_id: "x/y" }), WEB).primary.href, `${WEB}/cv?jobId=x%2Fy`)
})
