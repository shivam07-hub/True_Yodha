import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { newExtensionJob } from "../lib/onboarding/new-extension-job"

describe("the job door", () => {
  it("notices the first extension job that was not already saved", () => {
    const known = new Set(["ext_old"])
    assert.equal(newExtensionJob(known, [{ job_id: "ext_old" }, { job_id: "scraped" }]), null)
    assert.equal(newExtensionJob(known, [{ job_id: "ext_old" }, { job_id: "ext_new" }]), "ext_new")
  })

  it("is what the result page paints for awaiting_job_choice, and the extension door is phone-hidden", () => {
    const page = readFileSync(new URL("../app/onboarding/result/page.tsx", import.meta.url), "utf8")
    const door = readFileSync(new URL("../components/onboarding/job-choice.tsx", import.meta.url), "utf8")
    const css = readFileSync(new URL("../components/onboarding/job-choice.css", import.meta.url), "utf8")
    assert.match(page, /kind === "awaiting_job_choice"/)
    assert.match(page, /<JobChoice/)
    assert.match(door, /acceptFirstJob/)
    assert.match(door, /EXTENSION_WEBSTORE_URL/)
    assert.match(css, /max-width: 767px/)
    assert.match(css, /display: none/)
  })

})