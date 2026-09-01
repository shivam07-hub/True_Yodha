import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { displayCompany, formatKeywordChipLabel, resolvePlaygroundCompany } from "../components/cv/builder/keyword-utils"
import { CATEGORIES, SEVERITY } from "../components/feedback/feedback-types"
import { shortHeatmapSkillLabel } from "../lib/heatmap-labels"

const frontendRoot = process.cwd()

test("heatmap skill labels are short and page uses the helper", () => {
  assert.equal(shortHeatmapSkillLabel("Machine Learning"), "ML")
  assert.equal(shortHeatmapSkillLabel("Time Series Analysis And Forecasting"), "Time Srs")

  const source = readFileSync(join(frontendRoot, "app/(authed)/market/page.tsx"), "utf8")
  assert.match(source, /shortHeatmapSkillLabel/)
  assert.doesNotMatch(source, /max-width:\s*12ch/)
})

test("score gauge keeps the label outside the numeric center", () => {
  const source = readFileSync(join(frontendRoot, "components/cv/builder/score-gauge.tsx"), "utf8")

  assert.match(source, /className="score-center/)
  assert.match(source, /className="score-label"/)
  assert.doesNotMatch(source, /className="score-sub"/)
})

test("playground copy handles missing company and title-case conjunctions", () => {
  assert.equal(displayCompany("Untitled company"), "")
  assert.equal(displayCompany("  "), "")
  assert.equal(resolvePlaygroundCompany(null, undefined), "")
  assert.equal(resolvePlaygroundCompany("Untitled company", undefined), "")
  assert.equal(resolvePlaygroundCompany("Amex", undefined), "Amex")
  assert.equal(formatKeywordChipLabel("Time Series Analysis And Forecasting"), "Time Series Analysis and Forecasting")
})

test("feedback copy avoids dispatch and triage jargon", () => {
  assert.equal(CATEGORIES.bug.submitVerb, "Send bug report")
  assert.equal(CATEGORIES.idea.submitVerb, "Send idea")
  assert.equal(SEVERITY[0].label, "Minor")
  assert.equal(SEVERITY[0].desc, "Visual issue")
})
