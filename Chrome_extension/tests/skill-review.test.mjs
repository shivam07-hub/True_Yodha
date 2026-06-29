import { strict as assert } from "node:assert"
import test from "node:test"

import { buildSkillExtractionText, mergeSkillSuggestions } from "../src/skill-review.js"

test("builds extraction text from the JD and pasted skill evidence without losing either source", () => {
  const text = buildSkillExtractionText(
    "Own GTM analytics and work with stakeholders.",
    "SQL, Tableau, post-MBA strategy",
  )

  assert.match(text, /Own GTM analytics/)
  assert.match(text, /Required skills seen in this job:/)
  assert.match(text, /SQL, Tableau, post-MBA strategy/)
})

test("merges extracted skill suggestions into existing chips with category-wide de-dupe", () => {
  const merged = mergeSkillSuggestions(
    {
      primarySkills: ["SQL"],
      secondarySkills: ["Dashboarding", "Python (Programming Language)"],
      emergingSkills: ["LangGraph"],
    },
    {
      primary_skills: [
        { label: "SQL", taxonomy_key: "SQL" },
        { label: "Python", taxonomy_key: "Python (Programming Language)" },
      ],
      secondary_skills: [
        { label: "Stakeholder Management", taxonomy_key: "Stakeholder Management" },
        { label: "Dashboarding", taxonomy_key: "Dashboarding" },
      ],
      emerging_skills: [{ label: "LangGraph" }],
    },
  )

  assert.deepEqual(merged.primarySkills, ["SQL", "Python (Programming Language)"])
  assert.deepEqual(merged.secondarySkills, ["Dashboarding", "Stakeholder Management"])
  assert.deepEqual(merged.emergingSkills, ["LangGraph"])
})
