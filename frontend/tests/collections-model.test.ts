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
    status: null, notes: null, cv_badge: null, pending_apply: false,
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

test("fit orders by the printed match score, not a second local number", () => {
  const ordered = orderEntries([
    entry({ job_id: "a", job: job({ job_id: "a", match_score: 40 }) }),
    entry({ job_id: "b", job: job({ job_id: "b", match_score: 80 }) }),
  ], "fit")
  assert.deepEqual(ordered.map((e) => e.job_id), ["b", "a"])
})

test("orderEntries does not mutate its input", () => {
  const input = [
    entry({ job_id: "a", job: job({ job_id: "a", match_score: 10 }) }),
    entry({ job_id: "b", job: job({ job_id: "b", match_score: 90 }) }),
  ]
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

/* ── the loading contract ─────────────────────────────────────────────────────
 * Caught on the first real authed run: the page painted "0 0 0 0 0" chips and
 * "Nothing has cleared the bar yet" for ~1s, then jumped to 14/75/9/22/5 with
 * the active chip moving from Found to Applied. Every one of those was a claim
 * about the user's board made before the board arrived.
 * ────────────────────────────────────────────────────────────────────────── */

test("counts and landing are null until the record lands, never a confident zero", () => {
  const hook = read("../lib/collections/use-collection.ts")
  assert.match(hook, /counts: query\.data\?\.stages \?\? null/)
  assert.match(hook, /landing: query\.data\?\.landing \?\? null/)
  // The old fallbacks. A 0 is an answer and `found` is a choice; neither is
  // true before the request resolves.
  assert.doesNotMatch(hook, /EMPTY_COUNTS/)
  assert.doesNotMatch(hook, /landing:.*\?\? "found"/)
})

test("isEmpty is a verdict about the data, never the absence of it", () => {
  const hook = read("../lib/collections/use-collection.ts")
  assert.match(hook, /isEmpty: query\.data !== undefined && entries\.length === 0/)
  // Keyed on the DATA, so a 60s background refetch keeps rendering the record
  // instead of blanking the surface to a skeleton.
  assert.match(hook, /isLoading: query\.data === undefined/)
})

test("both skins branch on isLoading before any empty state can speak", () => {
  for (const path of [
    "../components/collections/collections-desktop.tsx",
    "../mobile/redesign/collections-surface.tsx",
  ]) {
    const src = read(path)
    const loadingAt = src.indexOf("collection.isLoading")
    const emptyAt = src.indexOf("emptyCopy(stage)")
    assert.ok(loadingAt > -1, `${path} must have a loading branch`)
    assert.ok(emptyAt > -1, `${path} must still have its empty copy`)
    assert.ok(loadingAt < emptyAt, `${path} must test isLoading BEFORE rendering a verdict`)
  }
})

test("a stage-less surface renders no rows and no empty verdict", () => {
  // `stage` is null while landing is unknown; `byStage(null)` must not be called
  // and `emptyCopy(null)` must not be rendered.
  for (const path of [
    "../components/collections/collections-desktop.tsx",
    "../mobile/redesign/collections-surface.tsx",
  ]) {
    const src = read(path)
    assert.match(src, /stage \? orderEntries\(collection\.byStage\(stage\), sort\) : \[\]/, path)
    assert.match(src, /stage \? emptyCopy\(stage\) : null/, path)
  }
})

test("a zero match score is no fit, not a zero fit — on every surface", () => {
  // `match_score` is 0 on every job the brain never evaluated. Unguarded it
  // paints a "0" ring, read as "0% match": all 22 applied cards of a real
  // board. Three renderers show a ring; all three must guard.
  assert.match(
    read("../components/collections/collection-rows.tsx"),
    /fit: job\.match_score > 0 \? job\.match_score : null/,
    "the desktop row",
  )
  assert.match(
    read("../mobile/redesign/collections-surface.tsx"),
    /fitKnown=\{\(entry\.job\.match_score \?\? 0\) > 0\}/,
    "the phone card",
  )
  const sheet = read("../mobile/redesign/job-detail-sheet.tsx")
  assert.match(sheet, /const fitKnown = row\.fit > 0/, "the phone detail sheet")
  assert.match(sheet, /fitKnown \? row\.fit : "—"/, "the sheet must show no number when there is no fit")
})

test("the picks band renders no chrome when every card is declined", () => {
  // Collections declines every pick until the record lands. The band used to
  // print its title, its promise and its closing divider over nothing.
  const band = read("../components/jobs/agent-picks-band.tsx")
  assert.match(band, /if \(!cards\.length\) return null/)
  const buildAt = band.indexOf("const cards = picks")
  const guardAt = band.indexOf("if (!cards.length) return null")
  const headerAt = band.indexOf("tm-agentpicks-head")
  assert.ok(buildAt > -1 && guardAt > buildAt, "cards must be built before the guard")
  assert.ok(guardAt < headerAt, "the guard must run before the header renders")
})

