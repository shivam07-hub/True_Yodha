/**
 * A removed skill has to survive a page load.
 *
 * Removal really deletes the row, so `allSkills` no longer holds it. The rail used
 * to keep the only copy in page state: reload, and the chip was gone with no way
 * back, while the ruling sat in the database. Rendering from a fresh mount is what
 * a reload is, so that is what this renders.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { SkillsRail } from "../components/cv/builder/skills-rail"
import { dataKeys } from "../lib/domain-data"
import type { UserSkillItem } from "../lib/api"

const BULLET = "Edited 15+ advertisement and brand promotion videos"

const skill = (key: string, level = 3): UserSkillItem => ({
  key,
  display_name: key,
  level,
  proficiency_title: "Scout",
  evidence_text: BULLET,
  forge_sessions_count: 0,
  forged_level_up_available: false,
})

function render(allSkills: UserSkillItem[], removedSkills: UserSkillItem[]): string {
  return renderToStaticMarkup(
    <SkillsRail
      token="t"
      skillsLine=""
      onSkillsLineChange={() => {}}
      onAddProven={() => {}}
      addingProven={false}
      provenStatus={null}
      allSkills={allSkills}
      removedSkills={removedSkills}
    />,
  )
}

test("a removed skill shows with Restore on a fresh mount", () => {
  const html = render([skill("Video Editing")], [skill("FitNesse", 1)])

  assert.match(html, /aria-label="Restore FitNesse"/)
  assert.match(html, /aria-label="Remove Video Editing"/)
})

test("a skill the user holds again is not offered as removed", () => {
  const html = render([skill("FitNesse")], [skill("FitNesse", 1)])

  assert.match(html, /aria-label="Remove FitNesse"/)
  assert.doesNotMatch(html, /aria-label="Restore FitNesse"/)
  assert.equal(html.match(/FitNesse<em/g)?.length, 1)
})

test("the tally counts what the user holds, not what they took off", () => {
  const html = render([skill("Video Editing")], [skill("FitNesse", 1), skill("SQL", 2)])

  assert.match(html, /<b>1<\/b> proven/)
})

test("a tier holding only removed skills leaves the tally but keeps its chips", () => {
  const html = render([], [skill("FitNesse", 1)])

  assert.match(html, /aria-label="Restore FitNesse"/)
  assert.doesNotMatch(html, /<b>0<\/b>/)
})

test("whatever refreshes a user's skills refreshes the removed ones too", () => {
  const [prefix] = dataKeys.userSkills()

  assert.equal(dataKeys.removedSkills()[0], prefix)
})
