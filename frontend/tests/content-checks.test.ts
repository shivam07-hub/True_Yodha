import test from "node:test"
import assert from "node:assert/strict"

import {
  runContentChecks,
  summarizeContentChecks,
  findingsForBullet,
  contentPenalty,
  contentFindingPoints,
  type ContentFinding,
} from "../components/cv/builder/content-checks"
import { CHECK_EXPLAINERS } from "../components/cv/builder/content-check-explainers"
import { itemId } from "../lib/cv-compose"
import type { CVStructured } from "../lib/api"

function cv(partial: Partial<CVStructured>): CVStructured {
  return {
    contact: { name: "T", title: "", email: "", phone: "", location: "", linkedin: "" },
    summary: null,
    education: [],
    experience: [],
    projects: [],
    skills_line: null,
    certs: [],
    ...partial,
  }
}

function exp(bullets: string[]): CVStructured["experience"][number] {
  return { role: "Role", company: "Co", dates: "2020 - 2021", location: "", bullets }
}

test("buzzword: flags a cliché in the summary", () => {
  const f = runContentChecks(cv({ summary: "I am an out of the box problem solver." }))
  const bz = f.filter(x => x.category === "buzzword")
  assert.equal(bz.length, 1)
  assert.equal(bz[0].kind, "Cut")
  assert.deepEqual(bz[0].section, "summary")
  assert.ok(bz[0].offenders.includes("out of the box"))
  assert.ok(bz[0].offenders.includes("problem solver"))
})

test("buzzword: a clean bullet with real skills is NOT flagged", () => {
  const f = runContentChecks(cv({ experience: [exp(["Shipped a React service handling 2M requests/day."])] }))
  assert.equal(f.filter(x => x.category === "buzzword").length, 0)
})

test("weak-verb: flags a duty opener but not an achievement opener", () => {
  const f = runContentChecks(cv({ experience: [exp([
    "Responsible for managing the data pipeline.",
    "Shipped 12 features across 3 quarters.",
  ])] }))
  const weak = f.filter(x => x.category === "weak-verb")
  assert.equal(weak.length, 1)
  assert.equal(weak[0].bulletIndex, 0)
  assert.equal(weak[0].kind, "Fix")
})

test("unquantified: flags a numberless bullet, spares one with a metric", () => {
  const f = runContentChecks(cv({ experience: [exp([
    "Improved conversion by streamlining the funnel.",
    "Raised revenue from ₹10L to ₹2Cr in 8 months.",
  ])] }))
  const q = f.filter(x => x.category === "unquantified")
  assert.equal(q.length, 1)
  assert.equal(q[0].bulletIndex, 0)
  assert.equal(q[0].kind, "Quantify")
})

test("unquantified: percent, currency, and magnitude words all count as quantified", () => {
  const f = runContentChecks(cv({ experience: [exp([
    "Cut latency by 30%.",
    "Managed a $2M budget.",
    "Onboarded thousands of users.",
  ])] }))
  assert.equal(f.filter(x => x.category === "unquantified").length, 0)
})

test("repetition: flags a phrase shared across two bullets", () => {
  const f = runContentChecks(cv({ experience: [exp([
    "Designed EV charging infrastructure and rollout for the north region.",
    "Led EV charging infrastructure and delivery across three states.",
  ])] }))
  const rep = f.filter(x => x.category === "repetition")
  assert.equal(rep.length, 2)
  assert.ok(rep.every(r => r.offenders[0].includes("charging infrastructure")))
})

test("repetition: a phrase used once is not flagged", () => {
  const f = runContentChecks(cv({ experience: [exp([
    "Designed EV charging infrastructure for the north region.",
    "Led a separate solar delivery programme.",
  ])] }))
  assert.equal(f.filter(x => x.category === "repetition").length, 0)
})

test("pure: identical CV yields identical finding ids (flywheel diff-able)", () => {
  const input = cv({ summary: "A dynamic team player.", experience: [exp(["Worked on stuff."])] })
  const a = runContentChecks(input).map(f => f.id).sort()
  const b = runContentChecks(input).map(f => f.id).sort()
  assert.deepEqual(a, b)
})

test("summarize: buckets by category, ordered by count desc", () => {
  const findings: ContentFinding[] = runContentChecks(cv({ experience: [exp([
    "Responsible for the dynamic synergy roadmap.",
    "Worked on nothing measurable here.",
  ])] }))
  const summary = summarizeContentChecks(findings)
  assert.ok(summary.length > 0)
  for (let i = 1; i < summary.length; i++) {
    assert.ok(summary[i - 1].count >= summary[i].count)
  }
  assert.ok(summary.every(s => typeof s.label === "string" && s.label.length > 0))
})

test("findingsForBullet: returns only the findings anchored to that bullet", () => {
  const findings = runContentChecks(cv({ experience: [exp([
    "Responsible for the out of the box roadmap.", // weak-verb + buzzword + unquantified
    "Shipped 10 features.",
  ])] }))
  const first = findingsForBullet(findings, { section: "experience", itemIndex: 0, bulletIndex: 0 })
  assert.ok(first.length >= 2)
  assert.ok(first.every(f => f.bulletIndex === 0))
})

test("penalty: total is the sum of per-finding points, fixing one returns exactly its points", () => {
  const messy = cv({ experience: [exp([
    "Responsible for the out of the box roadmap.", // weak-verb(2) + buzzword(2) + unquantified(3)
  ])] })
  const findings = runContentChecks(messy)
  const total = contentPenalty(findings)
  assert.equal(total, findings.reduce((s, f) => s + contentFindingPoints(f), 0))
  assert.ok(total >= 7) // 2 + 2 + 3
  // removing the finding's trigger drops exactly its points
  const clean = cv({ experience: [exp(["Shipped 10 features in 8 months, cutting latency 30%."])] })
  assert.equal(contentPenalty(runContentChecks(clean)), 0)
})

test("penalty: unquantified is weighted highest (recruiter signal)", () => {
  const q = runContentChecks(cv({ experience: [exp(["Improved the funnel."])] }))
    .filter(f => f.category === "unquantified")
  const bz = runContentChecks(cv({ summary: "A dynamic team player with 5 years." }))
    .filter(f => f.category === "buzzword")
  assert.ok(contentFindingPoints(q[0]) > contentFindingPoints(bz[0]))
})

test("hidden: a deselected bullet raises no findings and costs no points", () => {
  const input = cv({ experience: [exp([
    "Worked on the roadmap.",              // weak-verb + unquantified
    "Shipped 10 features in 8 months.",    // clean
  ])] })
  const hiddenIid = itemId("exp_bullet", 0, "Worked on the roadmap.")
  const all = runContentChecks(input)
  const filtered = runContentChecks(input, new Set([hiddenIid]))
  assert.ok(all.some(f => f.bulletIndex === 0))
  assert.equal(filtered.filter(f => f.bulletIndex === 0).length, 0)
  assert.ok(contentPenalty(filtered) < contentPenalty(all))
})

test("hidden: repetition needs two VISIBLE bullets — hiding one twin clears both flags", () => {
  const input = cv({ experience: [exp([
    "Designed EV charging infrastructure and rollout for the north region.",
    "Led EV charging infrastructure and delivery across three states.",
  ])] })
  assert.equal(runContentChecks(input).filter(f => f.category === "repetition").length, 2)
  const hiddenIid = itemId("exp_bullet", 1, "Led EV charging infrastructure and delivery across three states.")
  const filtered = runContentChecks(input, new Set([hiddenIid]))
  assert.equal(filtered.filter(f => f.category === "repetition").length, 0)
})

test("hidden: finding refs keep full-CV indices (jump anchors stay correct)", () => {
  const input = cv({ experience: [exp([
    "Improved the funnel with no numbers.", // unquantified — index 0 hidden
    "Improved the checkout experience too.", // unquantified — index 1 visible
  ])] })
  const hiddenIid = itemId("exp_bullet", 0, "Improved the funnel with no numbers.")
  const filtered = runContentChecks(input, new Set([hiddenIid]))
  const q = filtered.filter(f => f.category === "unquantified")
  assert.equal(q.length, 1)
  assert.equal(q[0].bulletIndex, 1) // NOT re-indexed to 0
})

test("hidden: empty hidden set behaves exactly like the one-arg call", () => {
  const input = cv({ summary: "A dynamic team player.", experience: [exp(["Worked on stuff."])] })
  const a = runContentChecks(input).map(f => f.id).sort()
  const b = runContentChecks(input, new Set()).map(f => f.id).sort()
  assert.deepEqual(a, b)
})

test("explainers: every content category has authored copy", () => {
  for (const cat of ["buzzword", "weak-verb", "unquantified", "repetition"] as const) {
    assert.ok(CHECK_EXPLAINERS[cat])
    assert.ok(CHECK_EXPLAINERS[cat].title.length > 0)
    assert.ok(CHECK_EXPLAINERS[cat].reasons.length > 0)
  }
})
