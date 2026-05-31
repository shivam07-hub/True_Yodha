import test from "node:test"
import assert from "node:assert/strict"

import { masterFilename, resolveMasterText } from "../lib/cv/download-master"
import type { CVVersion } from "../lib/api"

function fakeBaseline(body: string): CVVersion {
  return { body_text: body } as unknown as CVVersion
}

test("masterFilename: First_Last_CV.pdf from full name", () => {
  assert.equal(masterFilename("Shivam Pathak"), "Shivam_Pathak_CV.pdf")
})

test("masterFilename: strips punctuation, caps at 3 tokens", () => {
  assert.equal(masterFilename("Dr. Riya A. Mehta Jr."), "Dr_Riya_A_CV.pdf")
})

test("masterFilename: falls back when name empty/null", () => {
  assert.equal(masterFilename(""), "My_CV.pdf")
  assert.equal(masterFilename(null), "My_CV.pdf")
  assert.equal(masterFilename("   "), "My_CV.pdf")
})

test("resolveMasterText: prefers persisted body_text", () => {
  const txt = "x".repeat(120)
  assert.equal(resolveMasterText(fakeBaseline(txt), null), txt)
})

test("resolveMasterText: empty when no baseline body + no structured", () => {
  assert.equal(resolveMasterText(null, null), "")
  assert.equal(resolveMasterText(fakeBaseline("   "), null), "")
})
