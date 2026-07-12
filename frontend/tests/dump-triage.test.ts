import test from "node:test"
import assert from "node:assert/strict"

import {
  BATCH_SIZE,
  batches,
  isLinkedinNoise,
  isRecommendationsGiven,
  skipSummary,
  triageFiles,
} from "../lib/cv/dump-triage"

const file = (name: string, size = 1000): File =>
  new File([new Uint8Array(size)], name)

test("triageFiles: keeps CVs, docs, zips; names unsupported formats", () => {
  const { send, skipped } = triageFiles([
    file("Shivam_Pathak_CV.pdf"),
    file("pointers.md"),
    file("Complete_LinkedInDataExport.zip"),
    file("Shivam Pathak Profile.pptx"),
    file("resume.pages"),
  ])
  assert.deepEqual(send.map((f) => f.name), [
    "Shivam_Pathak_CV.pdf", "pointers.md", "Complete_LinkedInDataExport.zip",
  ])
  assert.deepEqual(skipped.map((s) => s.reason), ["unsupported", "unsupported"])
})

test("triageFiles: LinkedIn telemetry CSVs are set aside, signal CSVs kept", () => {
  const { send, skipped } = triageFiles([
    file("Positions.csv"),
    file("Shares_622594202.csv"),
    file("Connections.csv"),
    file("Ads Clicked.csv"),
    file("Logins.csv"),
    file("Comments_622594202.csv"),
    file("Recommendations_Given.csv"),
    file("Recommendations_Received.csv"),
  ])
  assert.deepEqual(send.map((f) => f.name), [
    "Positions.csv", "Shares_622594202.csv", "Connections.csv", "Recommendations_Received.csv",
  ])
  assert.equal(skipped.filter((s) => s.reason === "telemetry").length, 4)
})

test("triageFiles: duplicates (same name+size) and dotfiles are dropped", () => {
  const { send, skipped } = triageFiles([
    file(".DS_Store"),
    file("cv.pdf", 500),
    file("cv.pdf", 500),
    file("cv.pdf", 900), // different size → a different file, kept
  ])
  assert.equal(send.length, 2)
  assert.deepEqual(skipped.map((s) => s.reason), ["duplicate"])
})

test("triageFiles: over-cap files are named", () => {
  const { send, skipped } = triageFiles([file("huge.pdf", 9 * 1024 * 1024)])
  assert.equal(send.length, 0)
  assert.deepEqual(skipped, [{ name: "huge.pdf", reason: "too_large" }])
})

test("isLinkedinNoise: only CSVs match, numeric suffixes normalized", () => {
  assert.equal(isLinkedinNoise("Reactions_622594202.csv"), true)
  assert.equal(isLinkedinNoise("SearchQueries.csv"), true)
  assert.equal(isLinkedinNoise("messages.csv"), true)
  assert.equal(isLinkedinNoise("Positions.csv"), false)
  assert.equal(isLinkedinNoise("logins.pdf"), false) // not a CSV → not telemetry
})

test("isRecommendationsGiven matches the export basename in any casing", () => {
  assert.equal(isRecommendationsGiven("Recommendations_Given.csv"), true)
  assert.equal(isRecommendationsGiven("recommendations given.csv"), true)
  assert.equal(isRecommendationsGiven("Recommendations_Received.csv"), false)
})

test("batches: splits at the server per-request cap", () => {
  const items = Array.from({ length: 32 }, (_, i) => i)
  const groups = batches(items)
  assert.deepEqual(groups.map((g) => g.length), [BATCH_SIZE, BATCH_SIZE, 2])
})

test("skipSummary groups counts by reason", () => {
  const lines = skipSummary([
    { name: "a.csv", reason: "telemetry" },
    { name: "b.csv", reason: "telemetry" },
    { name: "c.pptx", reason: "unsupported" },
  ])
  assert.deepEqual(lines, ["2 LinkedIn telemetry", "1 unsupported format"])
})
