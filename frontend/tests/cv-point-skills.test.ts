import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  extractedSkillsForCvPoint,
  type CvPointExtractedSkill,
} from "../lib/skill-intelligence"
import type { UserSkillsByDomain } from "../lib/api"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

function userSkills(items: CvPointExtractedSkill[]): UserSkillsByDomain {
  return {
    by_cluster: {},
    by_domain: {
      General: items.map((item) => ({
        key: item.key,
        display_name: item.displayName,
        level: item.level,
        proficiency_title: `L${item.level}`,
        description: null,
        evidence_text: item.evidenceText,
        forge_sessions_count: 0,
        forged_level_up_available: false,
      })),
    },
  }
}

test("maps extracted skills to the CV point backed by their evidence text", () => {
  const point = "Generated SQL dashboards for revenue forecasting across 12 markets."
  const skills = userSkills([
    {
      key: "sql",
      displayName: "SQL",
      level: 3,
      evidenceText: "Generated SQL dashboards for revenue forecasting across 12 markets.",
    },
    {
      key: "forecasting",
      displayName: "Forecasting",
      level: 2,
      evidenceText: "SQL dashboards for revenue forecasting",
    },
    {
      key: "sap-hana",
      displayName: "SAP HANA",
      level: 4,
      evidenceText: "Led SAP HANA migration.",
    },
  ])

  assert.deepEqual(extractedSkillsForCvPoint(point, skills), [
    { key: "sql", displayName: "SQL", level: 3, evidenceText: skills.by_domain.General[0].evidence_text },
    {
      key: "forecasting",
      displayName: "Forecasting",
      level: 2,
      evidenceText: skills.by_domain.General[1].evidence_text,
    },
  ])
})

test("does not tag a CV point just because the skill name appears without extracted evidence", () => {
  const skills = userSkills([
    {
      key: "sql",
      displayName: "SQL",
      level: 3,
      evidenceText: "Generated SQL dashboards for revenue forecasting.",
    },
  ])

  assert.deepEqual(
    extractedSkillsForCvPoint("Mentioned SQL casually while describing stakeholder work.", skills),
    [],
  )
})

// The hierarchy redesign (2026-08-25) moved the CV pane onto CvLineRow inside
// WorkstationShell. The chips survived the move because "ATS labels" is rank 4
// in the handoff's own table — they just stopped hiding behind a per-row
// disclosure. Both authed surfaces feed them from the SAME cache key.
test("every CV line shows the ATS skills it proves, on both authed surfaces", () => {
  const row = read("components/cv/builder/cv-line-row.tsx")
  const chips = read("components/cv/builder/cv-point-skill-chips.tsx")
  const job = read("components/cv/builder/playground-view.tsx")
  const master = read("components/cv/builder/master-workspace.tsx")

  assert.match(row, /<CVPointSkillChips/)
  assert.match(chips, /extractedSkillsForCvPoint/)
  assert.match(chips, /cvb-pgc-ats-skills/)
  for (const surface of [job, master]) {
    assert.match(surface, /users\.mySkills/)
    assert.match(surface, /dataKeys\.userSkills/)
    assert.match(surface, /userSkills=\{/)
  }
})
