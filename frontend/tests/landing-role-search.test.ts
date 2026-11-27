/**
 * Spec #66 L2b: the hero's search reaches every family past the eight chips.
 * People type titles ("data analyst"), the families are skill domains ("Data
 * Analysis"), so the search reads words by their root, as the backend's
 * `family_match_score` does, and the two keep one word list. A searched family
 * then rides the upload and leads chapters 2–3 exactly like a chip.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import type { LandingRole } from "@/lib/api"
import { ALIASES, RANK_WORDS, SHOWN, STEM, matchRoles, roleLabel } from "@/components/public/landing/role-match"
import { chapterRoles, uploadDestination } from "@/components/public/landing/role-picker"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

// Busiest first, as `/public/landing-roles` lists them (real names, 2026-11-27).
const POOL = [
  "Banking Services",
  "Software Development",
  "Artificial Intelligence and Machine Learning (AI/ML)",
  "Business Analysis",
  "Project Management",
  "Human Resources Management and Planning",
  "Business Intelligence",
  "Data Analysis",
  "Cloud Computing",
  "Data Science",
  "Product Management",
  "Product Development",
  "Electrical and Computer Engineering",
  "User Interface and User Experience (UI/UX) Design",
  "Financial Analysis",
  "Investment Management",
].map((family, i) => ({ family, jobs: 1000 - i }))

const found = (query: string) => matchRoles(query, POOL).map((role) => role.family)

test("a title finds the family named for its field", () => {
  assert.deepEqual(found("data analyst"), ["Data Analysis"])
  assert.deepEqual(found("product manager"), ["Product Management"])
  assert.deepEqual(found("data scientist"), ["Data Science"])
  assert.deepEqual(found("financial analyst"), ["Financial Analysis"])
})

test("the list narrows as each word is typed, busiest first", () => {
  assert.deepEqual(found("da"), ["Data Analysis", "Data Science"])
  assert.deepEqual(found("prod"), ["Product Management", "Product Development"])
  assert.deepEqual(found("product dev"), ["Product Development"])
})

test("short forms people type reach the spelled-out family", () => {
  assert.deepEqual(found("hr"), ["Human Resources Management and Planning"])
  assert.deepEqual(found("ui"), ["User Interface and User Experience (UI/UX) Design"])
  assert.deepEqual(found("devops"), ["Cloud Computing"])
  assert.deepEqual(found("ai"), ["Artificial Intelligence and Machine Learning (AI/ML)"])
})

test("a family named in the words typed leads one reached by a short form", () => {
  const pool = [{ family: "Web Design and Development", jobs: 65 }, { family: "User Interface and User Experience (UI/UX) Design", jobs: 46 }]
  assert.deepEqual(
    matchRoles("ui ux", pool).map((role) => role.family),
    ["User Interface and User Experience (UI/UX) Design", "Web Design and Development"],
  )
})

test("rank words say how senior, not what: they never narrow the list", () => {
  assert.deepEqual(found("senior data analyst"), ["Data Analysis"])
  assert.deepEqual(found("senior "), [])
  // Still being typed, "an" may be the start of "analysis".
  assert.deepEqual(found("an"), ["Business Analysis", "Data Analysis", "Financial Analysis"])
})

test("a seat word lists its families: a person picks from the list", () => {
  assert.deepEqual(found("engineer"), ["Electrical and Computer Engineering"])
})

test("one letter lists nothing, a miss lists nothing, and the list stays short", () => {
  assert.deepEqual(found("d"), [])
  assert.deepEqual(found("astronaut"), [])
  // "investment" and "investigation" part after "invest": no false root.
  assert.deepEqual(found("investigator"), [])
  const many = Array.from({ length: SHOWN + 4 }, (_, i) => ({ family: `Data Thing ${i}`, jobs: i }))
  assert.equal(matchRoles("data", many).length, SHOWN)
})

test("the search keeps the backend matcher's words", () => {
  const py = read("../backend/app/repositories/role_families.py")
  const rank = py.match(/_RANK_WORDS = frozenset\(\{([\s\S]*?)\}\)/)
  const aliases = py.match(/_ALIASES = \{([\s\S]*?)\n\}/)
  const stem = py.match(/^_STEM = (\d+)$/m)
  assert.ok(rank && aliases && stem, "role_families.py moved its word lists")
  assert.deepEqual(new Set([...rank[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])), new Set(RANK_WORDS))
  assert.deepEqual(
    Object.fromEntries([...aliases[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]])),
    ALIASES,
  )
  assert.equal(Number(stem[1]), STEM)
})

function role(family: string, jobs: number): LandingRole {
  return { family, jobs, companies: 3, top_companies: [], skills: [], bands: [] }
}

test("a searched role leads the chapters and rides the upload like a chip", () => {
  const chips = ["Banking Services", "Software Development", "Business Analysis", "Project Management", "Customer Service"]
    .map((family, i) => role(family, 900 - i))
  const searched = role("Data Analysis", 302)
  assert.deepEqual(
    chapterRoles(chips, searched).map((item) => item.family),
    ["Data Analysis", "Banking Services", "Software Development", "Business Analysis"],
  )
  // A chip picked leads too, and is not listed twice.
  assert.deepEqual(
    chapterRoles(chips, chips[2]).map((item) => item.family),
    ["Business Analysis", "Banking Services", "Software Development", "Project Management"],
  )
  assert.equal(
    uploadDestination({ family: "User Interface and User Experience (UI/UX) Design", band: "entry" }),
    "/cv-preview?role=User+Interface+and+User+Experience+%28UI%2FUX%29+Design&level=entry",
  )
  assert.equal(roleLabel("Artificial Intelligence and Machine Learning (AI/ML)"), "AI/ML")
})

test("the hero offers the search between the chips and Not sure", () => {
  const picker = read("components/public/landing/role-picker.tsx")
  assert.match(picker, /<RoleSearch pool=\{pool\} onChoose=\{chooseSearched\} \/>/)
  assert.ok(picker.indexOf("<RoleSearch") < picker.indexOf("Not sure? Upload"))
  // The pool is the chips and every other family, from the one cached read.
  assert.match(picker, /\[\.\.\.offer\.roles, \.\.\.offer\.more\]/)
  const hero = read("components/public/landing/hero.tsx")
  assert.match(hero, /trackEvent\("landing_role_pick", \{[^}]*via \}\)/)
})
