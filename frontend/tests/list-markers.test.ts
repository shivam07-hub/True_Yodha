/**
 * The CV page's "Fix all" drops exactly what upload drops — one set of cases,
 * read here and by backend/tests/test_list_marker_cases.py.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import type { CVStructured } from "../lib/api"
import { markedLineCount, stripCopiedMarkers, withoutMarker } from "../lib/cv/list-markers"
import { runAtsChecks } from "../components/cv/builder/ats-checks"
import { buildIssues } from "../components/cv/builder/issue-model"

const { cases } = JSON.parse(
  readFileSync(new URL("../lib/cv/list-markers.cases.json", import.meta.url), "utf8"),
) as { cases: { in: string; out: string }[] }

test("the page agrees with upload ingest on every shared case", () => {
  assert.ok(cases.length >= 10)
  for (const c of cases) assert.equal(withoutMarker(c.in), c.out, c.in)
})

function cv(bullets: string[], certs: string[] = []): CVStructured {
  return {
    contact: { name: "A", title: "", email: "a@b.co", phone: "", location: "", linkedin: "" },
    summary: "Six years in B2B sales.",
    skills_line: "SQL, Excel",
    education: [],
    experience: [{ company: "Acme", role: "Analyst", dates: "2023 – Present", location: "", bullets }],
    projects: [{ name: "Side", dates: "", bullets: ["▸ Shipped the app"] }],
    certs,
  } as unknown as CVStructured
}

test("Fix all removes the copied marks and nothing else", () => {
  const before = cv(["▪ Built a pipeline", "Ran the close", "•"], ["• AWS Certified"])
  assert.equal(markedLineCount(before), 4)
  const after = stripCopiedMarkers(before)
  assert.deepEqual(after.experience[0].bullets, ["Built a pipeline", "Ran the close"])
  assert.deepEqual(after.projects[0].bullets, ["Shipped the app"])
  assert.deepEqual(after.certs, ["AWS Certified"])
  assert.equal(after.summary, before.summary)
  assert.equal(markedLineCount(after), 0)
})

test("a CV with copied marks gets one weak ats · layout row that fixes all of them", () => {
  const marked = cv(["▪ Built a pipeline", "▪ Ran the close"])
  const checks = runAtsChecks(marked, null, "cv.pdf")
  const issues = buildIssues({ cv: marked, fixes: [], atsChecks: checks, sectionInvites: false })
  const row = issues.find(i => i.provenance === "ats · layout")
  assert.ok(row, "the row is offered")
  assert.equal(row.severity, "weak")
  assert.equal(row.title, "3 bullets print a second mark")
  assert.equal(row.action, "Fix all")
  assert.ok(row.apply)
  assert.equal(markedLineCount(row.apply(marked)), 0)
  assert.ok(row.brief.reasons.length > 0)
  assert.ok(row.brief.example)
})

test("a clean CV is not offered the row", () => {
  const clean = cv(["Built a pipeline"])
  clean.projects = []
  const checks = runAtsChecks(clean, null, "cv.pdf")
  assert.equal(checks.find(c => c.label === "Bullets print one mark each")?.pass, true)
  const issues = buildIssues({ cv: clean, fixes: [], atsChecks: checks, sectionInvites: false })
  assert.equal(issues.some(i => i.provenance === "ats · layout"), false)
})
