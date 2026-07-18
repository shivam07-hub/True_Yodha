import test from "node:test"
import assert from "node:assert/strict"

import { mentorRewriteTarget } from "../lib/cv/mentor-rewrite-target"
import { itemId } from "../lib/cv-compose"
import type { CVStructured, UserSkillItem } from "../lib/api"

const cv: CVStructured = {
  summary: "Operations leader",
  experience: [{
    role: "Program Manager",
    company: "Acme",
    dates: "2022–2025",
    location: "Bengaluru",
    bullets: ["Aligned product, sales, and finance leaders around a shared launch plan."],
  }],
  projects: [],
  education: [],
  skills_line: "Stakeholder Management, Planning",
  certs: [],
}

const skill = (evidence: string | null): UserSkillItem => ({
  key: "stakeholder_management",
  display_name: "Stakeholder Management",
  level: 3,
  proficiency_title: "Practitioner",
  evidence_text: evidence,
  forge_sessions_count: 1,
  forged_level_up_available: true,
})

test("Mentor targets the exact CV bullet that already proves the practiced skill", () => {
  const evidence = cv.experience[0].bullets[0]
  assert.deepEqual(mentorRewriteTarget(cv, [skill(evidence)], "stakeholder_management"), {
    iid: itemId("exp_bullet", 0, evidence),
    keywords: ["Stakeholder Management"],
  })
})

test("Mentor accepts a tagger excerpt but never invents a host without evidence", () => {
  assert.ok(mentorRewriteTarget(cv, [skill("sales, and finance leaders")], "Stakeholder Management"))
  assert.equal(mentorRewriteTarget(cv, [skill(null)], "Stakeholder Management"), null)
  assert.equal(mentorRewriteTarget(cv, [skill("not found in this CV")], "Stakeholder Management"), null)
})
