import test from "node:test"
import assert from "node:assert/strict"

import { getApplyCommandState } from "../components/cv/builder/apply-command-model"

test("CV apply command makes save and preview one dirty-draft action", () => {
  assert.deepEqual(
    getApplyCommandState({ isDirty: true, isApplied: false, applyOpened: false }),
    {
      phase: "draft",
      status: "Unsaved draft",
      primaryLabel: "Save & preview",
      stepIndex: 0,
    },
  )
})

test("CV apply command keeps the next application step explicit", () => {
  assert.equal(
    getApplyCommandState({ isDirty: false, isApplied: false, applyOpened: false }).primaryLabel,
    "Preview & download",
  )
  assert.equal(
    getApplyCommandState({ isDirty: false, isApplied: false, applyOpened: true }).primaryLabel,
    "Mark applied",
  )
  assert.equal(
    getApplyCommandState({ isDirty: false, isApplied: true, applyOpened: true }).primaryLabel,
    "View applications",
  )
})
