import test from "node:test"
import assert from "node:assert/strict"

import { masterContactFromCV, masterFilename, resolveMasterStructured } from "../lib/cv/download-master"
import type { CVStructured, CVVersion } from "../lib/api"

const STRUCTURED: CVStructured = {
  contact: {
    name: "Deveshwar Kashyap",
    title: "Manager – Subscriber Marketing",
    location: "",
    email: "user@example.com",
    phone: "+91 90000 00000",
    linkedin: "",
  },
  summary: "Marketing manager.",
  education: [],
  experience: [
    { role: "Manager", company: "Tata Play", location: "Mumbai", dates: "2025–", bullets: ["Drove ₹30Cr ARR"] },
  ],
  projects: [],
  skills_line: "Growth Marketing, GTM Strategy",
  certs: [],
}

function fakeBaseline(structured: unknown): CVVersion {
  return { body_text: "raw extracted text", cv_structured: structured } as unknown as CVVersion
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

test("resolveMasterStructured: prefers the explicit structured CV", () => {
  const other = { ...STRUCTURED, summary: "From baseline snapshot." }
  const resolved = resolveMasterStructured(fakeBaseline(other), STRUCTURED)
  assert.equal(resolved?.summary, "Marketing manager.")
})

test("resolveMasterStructured: falls back to the baseline snapshot — never body_text", () => {
  const resolved = resolveMasterStructured(fakeBaseline(STRUCTURED), null)
  assert.equal(resolved?.skills_line, "Growth Marketing, GTM Strategy")
  assert.equal(resolved?.experience[0]?.bullets[0], "Drove ₹30Cr ARR")
})

test("resolveMasterStructured: empty snapshot ({}) resolves to null", () => {
  // The backend coerces absent snapshots to {} — that is not renderable.
  assert.equal(resolveMasterStructured(fakeBaseline({}), null), null)
  assert.equal(resolveMasterStructured(null, null), null)
})

test("resolveMasterStructured: normalizes missing arrays to renderable defaults", () => {
  const sparse = { summary: "Only a summary." }
  const resolved = resolveMasterStructured(fakeBaseline(sparse), null)
  assert.ok(resolved)
  assert.deepEqual(resolved?.experience, [])
  assert.deepEqual(resolved?.certs, [])
  assert.equal(resolved?.skills_line, null)
})

test("masterContactFromCV: CV contact first, profile name fallback", () => {
  const contact = masterContactFromCV(STRUCTURED, "Profile Name")
  assert.equal(contact.name, "Deveshwar Kashyap")
  const noContact = resolveMasterStructured(fakeBaseline({ summary: "x" }), null)
  assert.ok(noContact)
  assert.equal(masterContactFromCV(noContact, "Profile Name").name, "Profile Name")
})
