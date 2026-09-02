import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import type { CollectionEntry, CollectionStage, JobMatch } from "../lib/api"
import { ORIGIN_LABEL, emptyCopy, heroFor, orderEntries } from "../lib/collections/model"

/** The Collection Record, client side. The stage/origin/liveness/count rules are
 *  the RESOLVER's and are tested in backend/tests/test_collection_record.py —
 *  what is testable here is what is left: the hero, the order, and the words. */

function job(over: Partial<JobMatch> = {}): JobMatch {
  return {
    id: 1, job_id: "j1", title: "Analyst", company: "Acme", location: null, remote: false,
    overlap_score: 70, match_score: 70, verdict: "strong", is_strong: true, llm_rank: 1,
    llm_explanation: null, batch_week: "2026-08-31", source_url: null, matched_skills: [],
    missing_skills: [], job_description: null, grade: "A", ...over,
  } as JobMatch
}

function entry(over: Partial<CollectionEntry> = {}): CollectionEntry {
  return {
    job_id: "j1", stage: "found", origin: "myro", liveness: "live", job: job(),
    status: null, is_priority: false, notes: null, cv_badge: null, pending_apply: false,
    saved_at: null, applied_at: null,
    needs_user: true, ...over,
  }
}

// ── the hero ─────────────────────────────────────────────────────────────────

test("a strong found role's hero is Tailor CV", () => {
  const hero = heroFor(entry({ stage: "found", job: job({ verdict: "strong" }) }))
  assert.equal(hero.label, "Tailor CV")
  assert.equal(hero.kind, "go")
  assert.match(hero.href ?? "", /^\/cv\?jobId=/)
})

test("a stretch's hero is closing gaps, not tailoring", () => {
  // Both skins printed "Tailor CV" on every row including stretches — the
  // opposite error to the Jobs face, which printed a move as a second CTA.
  const hero = heroFor(entry({
    job: job({ verdict: "stretch", is_strong: false, missing_skills: ["SQL", "dbt"] }),
  }))
  assert.equal(hero.kind, "gap")
  assert.match(hero.label, /Close 2 gaps/)
  assert.equal(hero.href, "/practice")
})

test("an applied entry hands off to its prep room", () => {
  const hero = heroFor(entry({ stage: "applied", status: "applied" }))
  assert.equal(hero.label, "Prep room")
  assert.equal(hero.href, "/preparations/j1")
})

test("a closed entry's one move is that company's live openings", () => {
  const hero = heroFor(entry({ stage: "closed", liveness: "down" }))
  assert.match(hero.label, /More at Acme/)
  assert.equal(hero.href, null) // the surface supplies the company link
})

test("every stage yields exactly one hero", () => {
  const stages: CollectionStage[] = ["found", "saved", "tailored", "applied", "closed"]
  for (const stage of stages) {
    const hero = heroFor(entry({ stage }))
    assert.ok(hero.label.length > 0, stage)
  }
})

// ── order ────────────────────────────────────────────────────────────────────

test("priority wins over every sort axis", () => {
  const ordered = orderEntries([
    entry({ job_id: "a", job: job({ job_id: "a", match_score: 90 }) }),
    entry({ job_id: "b", is_priority: true, job: job({ job_id: "b", match_score: 10 }) }),
  ], "fit")
  assert.deepEqual(ordered.map((e) => e.job_id), ["b", "a"])
})

test("fit orders by the printed match score, not a second local number", () => {
  const ordered = orderEntries([
    entry({ job_id: "a", job: job({ job_id: "a", match_score: 40 }) }),
    entry({ job_id: "b", job: job({ job_id: "b", match_score: 80 }) }),
  ], "fit")
  assert.deepEqual(ordered.map((e) => e.job_id), ["b", "a"])
})

test("orderEntries does not mutate its input", () => {
  const input = [entry({ job_id: "a" }), entry({ job_id: "b", is_priority: true })]
  orderEntries(input, "fit")
  assert.deepEqual(input.map((e) => e.job_id), ["a", "b"])
})

// ── the words ────────────────────────────────────────────────────────────────

test("every stage has its own empty copy, never a blanket nothing-here", () => {
  const stages: CollectionStage[] = ["found", "saved", "tailored", "applied", "closed"]
  const seen = new Set(stages.map((s) => emptyCopy(s)))
  assert.equal(seen.size, stages.length)
})

test("origin is a label for all three kinds", () => {
  assert.deepEqual(Object.keys(ORIGIN_LABEL).sort(), ["extension", "myro", "you"])
})

// ── the contract, as code ────────────────────────────────────────────────────

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

/** Source-grep contracts assert on CODE — imports and JSX — never on any
 *  mention of a name, or the comment explaining why a rule exists trips it. */
const imports = (src: string) => src.split("\n").filter((l) => /^import\b/.test(l)).join("\n")

test("neither skin re-derives the partition it is handed", () => {
  // One read, one key: the counts, the stage and the closed split are the
  // resolver's answers (CONTEXT.md → Collection Record). Both skins used to
  // compute all three, separately, off three caches that could disagree.
  for (const path of [
    "../components/collections/collections-desktop.tsx",
    "../mobile/redesign/collections-surface.tsx",
  ]) {
    const src = read(path)
    assert.match(imports(src), /use-collection/, path)
    assert.doesNotMatch(src, /dataKeys\.applications\(\)/, path)
    assert.doesNotMatch(src, /dataKeys\.jobs\(\)/, path)
    // The five deleted derivations cannot be imported — tsc enforces that they
    // are gone; this catches a re-implementation under the same names.
    assert.doesNotMatch(imports(src), /splitClosedApps|buildMyroFound|chipCounts|isMyroSource/, path)
  }
})

test("grade is not on the Collections face either", () => {
  // Same collision the Jobs face locked out: a letter beside the ring is a
  // second "how good". It lives in the Why panel. Assert on the IMPORT and the
  // JSX, not on the string — prose explaining the rule must not trip it.
  const row = read("../components/collections/collection-rows.tsx")
  assert.doesNotMatch(row, /^import .*GradeBadge/m)
  assert.doesNotMatch(row, /<GradeBadge/)
  assert.doesNotMatch(read("../mobile/redesign/collection-card.tsx"), /row\.hasGrade/)
  // …and it IS in the panel that explains how good the role is.
  assert.match(read("../components/jobs/card-detail-rail.tsx"), /fc-rail-grade/)
})
