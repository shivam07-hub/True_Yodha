import test from "node:test"
import assert from "node:assert/strict"

import {
  buildDiaryPrefill,
  buildDiarySelectionsHref,
  parseDiarySelections,
  toggleDiarySelection,
  type DiarySkillSelection,
} from "./diary-skill-cart"

test("buildDiarySelectionsHref round-trips mixed add and upgrade selections", () => {
  const selections: DiarySkillSelection[] = [
    { skill: "Python", intent: "add", source: "job-gap" },
    { skill: "SQL", intent: "upgrade", level: 2, source: "skill-demand" },
  ]

  const href = buildDiarySelectionsHref(selections)
  const url = new URL(href, "https://example.com")
  const parsed = parseDiarySelections(url.searchParams)
  const prefill = buildDiaryPrefill(parsed)

  assert.equal(url.pathname, "/diary")
  assert.deepEqual(parsed, selections)
  assert.deepEqual(prefill.skills, ["Python", "SQL"])
  assert.match(prefill.entryText, /Python/)
  assert.match(prefill.entryText, /SQL/)
  assert.match(prefill.entryText, /L2/)
})

test("parseDiarySelections supports legacy comma-separated skills", () => {
  const params = new URLSearchParams("skills=React,TypeScript")

  assert.deepEqual(parseDiarySelections(params), [
    { skill: "React", intent: "add" },
    { skill: "TypeScript", intent: "add" },
  ])
})

test("toggleDiarySelection adds and removes the same skill", () => {
  const selection: DiarySkillSelection = { skill: "Communication", intent: "upgrade", level: 3 }
  const added = toggleDiarySelection([], selection)
  const removed = toggleDiarySelection(added, selection)

  assert.deepEqual(added, [selection])
  assert.deepEqual(removed, [])
})
