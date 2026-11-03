import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  displayCompany, formatKeywordChipLabel, resolvePlaygroundCompany, resolvePlaygroundTitle,
} from "../components/cv/builder/keyword-utils"
import { CATEGORIES, SEVERITY } from "../components/feedback/feedback-types"
import { shortHeatmapSkillLabel } from "../lib/heatmap-labels"

const frontendRoot = process.cwd()

test("heatmap skill labels are short and page uses the helper", () => {
  assert.equal(shortHeatmapSkillLabel("Machine Learning"), "ML")
  assert.equal(shortHeatmapSkillLabel("Time Series Analysis And Forecasting"), "Time Srs")

  const source = readFileSync(join(frontendRoot, "components/market/intel-workspace.tsx"), "utf8")
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

// FD3 (U4, 2026-10-19): the header read "Untitled role" until the job loaded.
test("the playground title waits for the job instead of naming it Untitled", () => {
  assert.equal(resolvePlaygroundTitle(undefined, true), "")
  assert.equal(resolvePlaygroundTitle(" Business Analyst ", false), "Business Analyst")
  assert.equal(resolvePlaygroundTitle(null, false), "Untitled role")

  const source = readFileSync(join(frontendRoot, "components/cv/builder/use-playground-model.ts"), "utf8")
  assert.match(source, /resolvePlaygroundTitle\(job\.job_title, jobPathQuery\.isLoading\)/)
})

test("feedback copy avoids dispatch and triage jargon", () => {
  assert.equal(CATEGORIES.bug.submitVerb, "Send bug report")
  assert.equal(CATEGORIES.idea.submitVerb, "Send idea")
  assert.equal(SEVERITY[0].label, "Minor")
  assert.equal(SEVERITY[0].desc, "Visual issue")
})
