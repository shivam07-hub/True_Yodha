/**
 * Remaining Tailor Order locks: overlay opens on the loom, hide leaves the
 * paper, original mix, section order, Match follows a hidden CV line.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { projectCoverage } from "../components/cv/builder/match-score"
import { normalizeSectionOrder, moveSection } from "../lib/cv/section-order"
import { collectHiddenLines } from "../lib/cv/hidden-lines"
import { gapCardMatches } from "../lib/cv/gap-focus"
import type { CVStructured } from "../lib/api"
import { itemId } from "../lib/cv-compose"

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const weave = read("components/cv/builder/tailor-weave.tsx")
const api = read("lib/api.ts")
const list = read("components/cv/builder/cv-pointer-list.tsx")
const css = read("app/(authed)/cv/cv-workstation.css")

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

test("LLM coverage and weave calls wait 60s, and do not blindly retry", () => {
  assert.match(api, /jdCoverage:[\s\S]*timeoutMs: LLM_REQUEST_TIMEOUT_MS/)
  assert.match(api, /interview:[\s\S]*timeoutMs: LLM_REQUEST_TIMEOUT_MS/)
  assert.match(api, /run:[\s\S]*timeoutMs: LLM_REQUEST_TIMEOUT_MS/)
  assert.match(weave, /retry: false/)
  assert.match(weave, /weaveStarted\.current = true/)
  assert.doesNotMatch(
    code(weave.slice(weave.indexOf("onError: (e: Error) => {"), weave.indexOf("const bankAnswer"))),
    /weaveStarted\.current = false/,
  )
})

test("interview waits for playground coverage and never treats a miss as empty", () => {
  assert.match(weave, /coverageSettled/)
  assert.match(weave, /Retry/)
  assert.doesNotMatch(code(weave), /questions\.length === 0 && interview\.isError/)
})

test("hidden pointers leave the list — they are not struck ghosts", () => {
  assert.match(list, /shown\.filter\(r => !r\.hidden\)/)
  assert.doesNotMatch(css, /is-hidden/)
})

test("section order pins identity and keeps every other block", () => {
  assert.deepEqual(normalizeSectionOrder(["certs", "nope", "summary"]), [
    "certs", "summary", "experience", "projects", "skills_line", "education",
  ])
  assert.deepEqual(
    moveSection(["summary", "experience", "projects", "skills_line", "education", "certs"], 1, 0),
    ["experience", "summary", "projects", "skills_line", "education", "certs"],
  )
})

test("hiding a CV-sourced coverage line drops Match credit", () => {
  const counts = projectCoverage([
    { status: "covered", source: "cv", story_pointer: "Led GTM." },
    { status: "covered", source: "story", story_pointer: "Led GTM." },
  ], new Set(["Led GTM."]))
  assert.deepEqual(counts, { covered: 1, weak: 0, gap: 1 })
})

test("a Skills-map row names the requirement it would close", () => {
  assert.equal(gapCardMatches("Python on the data stack", ["Python", "SQL"]), true)
  assert.equal(gapCardMatches("enterprise GTM", ["Go-To-Market"]), false)
})

test("hidden chrome lists the lines that left the paper", () => {
  const cv: CVStructured = {
    contact: { name: "", title: "", location: "", email: "", phone: "", linkedin: "" },
    summary: "I ship.",
    experience: [{ role: "AE", company: "Acme", dates: "2020", location: "", bullets: ["Closed 12 deals."] }],
    projects: [],
    education: [],
    skills_line: "",
    certs: [],
  }
  const hidden = new Set([itemId("exp_bullet", 0, "Closed 12 deals.")])
  const lines = collectHiddenLines(cv, hidden)
  assert.equal(lines.length, 1)
  assert.equal(lines[0]?.text, "Closed 12 deals.")
})

test("a card that reworded nothing says so, and drops its no-op provenance", () => {
  const card = read("components/cv/builder/weave-role-card.tsx")
  assert.match(card, /role\.edit_kind === "trim"/)
  assert.match(card, /Nothing reworded\./)
  // A verbatim line's "was" and "original" both resolve to itself — noise.
  assert.match(card, /const verbatim = sources\.length === 1 && sources\[0\] === b\.text/)
  assert.match(card, /b\.from_lines\.length > 0 && !verbatim/)
  assert.match(card, /sources\.length > 0 && !verbatim/)
})

test("flipping a merged line back to original restores every line it merged", () => {
  const card = read("components/cv/builder/weave-role-card.tsx")
  // The preview renders the sources as separate lines...
  assert.match(card, /originalLinesFor\(originalIndexes, i, sources\)/)
  assert.match(card, /shown\.map\(/)
  assert.doesNotMatch(card, /from_lines\.filter\(Boolean\)\.join\(" "\)/)
  // ...and a Take writes them the same way.
  const weave = readFileSync(
    new URL("../../backend/app/services/cv_weave.py", import.meta.url), "utf8",
  )
  const take = weave.slice(weave.indexOf("def _take_bullets"), weave.indexOf("def land_extras"))
  assert.match(take, /out\.extend\(from_lines/)
  assert.doesNotMatch(take, /" "\.join\(from_lines\)/)
})

test("no list in the weave card is keyed by its own text", () => {
  const card = read("components/cv/builder/weave-role-card.tsx")
  assert.doesNotMatch(card, /key=\{t\}/, "two stories can share a title")
  assert.doesNotMatch(card, /key=\{line\}/, "two dropped lines can be identical")
})

test("the answer endpoint reads its coverage row once, not twice", () => {
  const router = readFileSync(
    new URL("../../backend/app/routers/cv/weave.py", import.meta.url), "utf8",
  )
  const answer = router.slice(
    router.indexOf("async def weave_answer"),
    router.indexOf("@router.get(\"/weave/{job_id}\""),
  )
  const reads = answer.match(/get_deepening\(/g) ?? []
  assert.equal(reads.length, 1, "one read serves both the upgrade lookup and the patch")
})
