import { test } from "node:test"
import assert from "node:assert/strict"
import {
  cvStructuredEqual,
  masterDraftKey,
  parsePersistedDraft,
  pickInitialDraft,
} from "../lib/cv-autosave"
import type { CVStructured } from "../lib/api"

function cv(over: Partial<CVStructured> = {}): CVStructured {
  return {
    summary: "s",
    education: [],
    experience: [{ company: "Co", role: "Eng", dates: "2020", location: "", bullets: ["a", "b"] }],
    projects: [],
    skills_line: "x, y",
    certs: [],
    ...over,
  }
}

test("equal ignores object identity, catches content change", () => {
  assert.equal(cvStructuredEqual(cv(), cv()), true)
  assert.equal(cvStructuredEqual(cv(), cv({ summary: "changed" })), false)
  assert.equal(cvStructuredEqual(cv(), cv({ certs: ["new"] })), false)
})

test("equal handles nulls", () => {
  assert.equal(cvStructuredEqual(null, null), true)
  assert.equal(cvStructuredEqual(cv(), null), false)
})

test("pickInitialDraft recovers a divergent persisted draft", () => {
  const server = cv()
  const persisted = cv({ summary: "user was mid-edit" })
  assert.equal(pickInitialDraft(server, persisted)?.summary, "user was mid-edit")
})

test("pickInitialDraft trusts server when persisted matches", () => {
  const server = cv()
  assert.equal(pickInitialDraft(server, cv())?.summary, "s")
})

test("pickInitialDraft falls back to persisted when no server", () => {
  assert.equal(pickInitialDraft(null, cv({ summary: "z" }))?.summary, "z")
})

test("masterDraftKey is user-scoped", () => {
  assert.equal(masterDraftKey("u1"), "myro-cv-master-draft-v1:u1")
  assert.notEqual(masterDraftKey("u1"), masterDraftKey("u2"))
})

test("parsePersistedDraft tolerates corruption", () => {
  assert.equal(parsePersistedDraft(null), null)
  assert.equal(parsePersistedDraft("{bad json"), null)
  assert.equal(parsePersistedDraft("{}"), null) // no experience array
  assert.equal(parsePersistedDraft(JSON.stringify(cv()))?.summary, "s")
})
