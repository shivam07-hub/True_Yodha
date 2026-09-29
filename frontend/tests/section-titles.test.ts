import test from "node:test"
import assert from "node:assert/strict"

import {
  DEFAULT_SECTION_TITLES,
  MAX_SECTION_TITLE,
  cleanSectionTitle,
  sectionTitle,
  withSectionTitle,
} from "../lib/cv/section-titles"
import { SECTION_KEYS } from "../lib/cv/section-order"

test("every section has a default heading", () => {
  for (const key of SECTION_KEYS) assert.ok(DEFAULT_SECTION_TITLES[key])
})

test("a renamed heading reads as the person's; the rest stay default", () => {
  const titles = { projects: "Projects and Agentic Pursuits" }
  assert.equal(sectionTitle("projects", titles), "Projects and Agentic Pursuits")
  assert.equal(sectionTitle("experience", titles), "Experience")
  assert.equal(sectionTitle("projects", null), "Projects")
})

test("renaming back to the default, or to nothing, resets it", () => {
  const titles = { projects: "Projects and Agentic Pursuits" }
  assert.deepEqual(withSectionTitle(titles, "projects", "  projects "), {})
  assert.deepEqual(withSectionTitle(titles, "projects", "   "), {})
})

test("whitespace collapses and the heading stays one line long", () => {
  assert.equal(cleanSectionTitle("projects", "  Projects   and  Agentic "), "Projects and Agentic")
  assert.equal(cleanSectionTitle("projects", "x".repeat(80))?.length, MAX_SECTION_TITLE)
})
