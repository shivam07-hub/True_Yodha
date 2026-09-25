import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  groupLearningRepos,
  isLivePath,
  requestQueue,
  sortAnchorCards,
  sortStoryCards,
  storyBands,
  type BandSkillMap,
  type CareerSkillPath,
  type SkillPathCard,
} from "../lib/career-skill-path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

function card(
  taxonomy_key: string,
  state: SkillPathCard["state"],
  extra: Partial<SkillPathCard> = {},
): SkillPathCard {
  return {
    skill_id: null,
    taxonomy_key,
    display_name: taxonomy_key,
    state,
    current_level: null,
    required_level: null,
    evidence_pointer: null,
    demand: null,
    ladder_complete: false,
    certificate_status: "none",
    verification_id: null,
    next_practice_level: null,
    request_status: "none",
    ...extra,
  }
}

function band(
  kind: BandSkillMap["kind"],
  seniority: BandSkillMap["seniority"],
  cards: SkillPathCard[],
): BandSkillMap {
  return { kind, seniority, job_count: 10, cards }
}

function path(extra: Partial<CareerSkillPath> = {}): CareerSkillPath {
  return {
    needs_target: false,
    snapshot: null,
    lower: null,
    anchor: null,
    higher: null,
    next_action: null,
    target_flow: null,
    ...extra,
  }
}

test("practice no longer rebuilds demand from job gaps", () => {
  const practice = read("app/(authed)/practice/page.tsx")
  assert.doesNotMatch(practice, /buildPracticeSkills/)
  assert.doesNotMatch(practice, /jobs\.matches/)
  assert.match(practice, /SkillPathMaps/)
  assert.match(practice, /RequiresCareerTarget/)
})

test("upskilling view does not overlay frontend demand", () => {
  const view = read("components/skills/upskilling/upskilling-view.tsx")
  assert.doesNotMatch(view, /function mergeSkills/)
  assert.doesNotMatch(view, /practiceSkills/)
  assert.doesNotMatch(view, /wanted by/)
})

test("retired practice-skills demand overlay is gone", () => {
  let missing = false
  try {
    read("lib/practice-skills.ts")
  } catch {
    missing = true
  }
  assert.equal(missing, true)
})

test("climb list does not render required-by demand prose", () => {
  const row = read("components/skills/upskilling/climb-row.tsx")
  assert.doesNotMatch(row, /wanted by/)
  assert.doesNotMatch(row, /required by/)
})

test("personal job-count demand heuristic is gone; corpus taxonomy helper remains", () => {
  const demand = read("lib/demand-band.ts")
  assert.doesNotMatch(demand, /export function bandFromJobCount/)
  assert.match(demand, /export function bandFromCorpusJobCount/)
})

test("anchor cards put not-evidenced gaps first", () => {
  const ordered = sortAnchorCards([
    card("Sales", "on_cv"),
    card("Cold Calling", "not_evidenced"),
    card("Cross-Selling", "practised"),
    card("Channel Sales", "not_evidenced"),
  ])
  assert.deepEqual(ordered.map((item) => item.taxonomy_key), [
    "Cold Calling",
    "Channel Sales",
    "Sales",
    "Cross-Selling",
  ])
})

test("a live path is one the user can practise or add now", () => {
  assert.equal(isLivePath(card("Sales", "not_evidenced")), false)
  assert.equal(isLivePath(card("Sales", "not_evidenced", { request_status: "recorded" })), false)
  assert.equal(
    isLivePath(card("SQL", "not_evidenced", { ladder_complete: true, next_practice_level: 1 })),
    true,
  )
  assert.equal(
    isLivePath(card("SQL", "practised", { request_status: "fulfilled" })),
    true,
  )
  assert.equal(
    isLivePath(card("SQL", "practised", {
      certificate_status: "issued",
      verification_id: "abc",
    })),
    true,
  )
})

test("story bands are your band, then lower, then next", () => {
  const ordered = storyBands(path({
    lower: band("lower", "mid", []),
    higher: band("higher", "lead", []),
    anchor: band("anchor", "senior", []),
  }))
  assert.deepEqual(ordered.map((item) => item.kind), ["anchor", "lower", "higher"])
})

test("story bands skip a missing neighbour", () => {
  const ordered = storyBands(path({
    higher: band("higher", "mid", []),
    anchor: band("anchor", "entry", []),
  }))
  assert.deepEqual(ordered.map((item) => item.kind), ["anchor", "higher"])
})

test("story cards put live paths first and keep demand order inside each group", () => {
  const ordered = sortStoryCards([
    card("Sales", "not_evidenced"),
    card("SQL", "not_evidenced", { ladder_complete: true, next_practice_level: 1 }),
    card("Cross-Selling", "not_evidenced"),
    card("Excel", "practised", { request_status: "fulfilled" }),
  ])
  assert.deepEqual(ordered.map((item) => item.taxonomy_key), [
    "SQL",
    "Excel",
    "Sales",
    "Cross-Selling",
  ])
})

test("request queue is the leftover after the story, unique, your band first", () => {
  const sales = card("Sales", "not_evidenced")
  const sql = card("SQL", "not_evidenced", { ladder_complete: true, next_practice_level: 1 })
  const comms = card("Communication", "on_cv")
  const queued = requestQueue(path({
    lower: band("lower", "mid", [card("Sales", "not_evidenced"), card("Cold Calling", "not_evidenced")]),
    anchor: band("anchor", "senior", [sales, sql, comms]),
    higher: band("higher", "lead", [card("Communication", "not_evidenced")]),
  }))
  assert.deepEqual(queued.map((item) => item.taxonomy_key), [
    "Sales",
    "Communication",
    "Cold Calling",
  ])
})

test("repositories on the path group by use case and drop empty groups", () => {
  const groups = groupLearningRepos([
    {
      full_name: "rust-lang/rust",
      html_url: "https://github.com/rust-lang/rust",
      roadmap_slug: "rust",
      use_case: "language",
      taxonomy_key: "Rust (Programming Language)",
    },
    {
      full_name: "python/cpython",
      html_url: "https://github.com/python/cpython",
      roadmap_slug: "python",
      use_case: "language",
      taxonomy_key: "Python (Programming Language)",
    },
    {
      full_name: "kubernetes/kubernetes",
      html_url: "https://github.com/kubernetes/kubernetes",
      roadmap_slug: "kubernetes",
      use_case: "data_infrastructure",
      taxonomy_key: "Kubernetes",
    },
  ])
  assert.deepEqual(groups.map((group) => group.label), ["Language", "Data"])
  assert.deepEqual(groups[0].repos.map((repo) => repo.full_name), [
    "rust-lang/rust",
    "python/cpython",
  ])
})

test("the practice story lists repository links beside the bands", () => {
  const maps = read("components/career-path/skill-path-maps.tsx")
  assert.match(maps, /groupLearningRepos/)
  assert.match(maps, /repo\.html_url/)
  assert.match(maps, /RepositoryList/)
})

test("the practice story does not mix request CTAs into the band maps", () => {
  const maps = read("components/career-path/skill-path-maps.tsx")
  assert.match(maps, /storyBands\(path\)/)
  assert.match(maps, /sortStoryCards/)
  assert.match(maps, /RequestBoard/)
  assert.doesNotMatch(maps, /Request this learning path/)
  const requests = read("components/career-path/skill-path-requests.tsx")
  assert.match(requests, /Request this learning path/)
})

test("practice home is the skill-path story; the climb opens only for a session", () => {
  const practice = read("app/(authed)/practice/page.tsx")
  assert.match(practice, /const inSession = Boolean\(gapParam \|\| skillParam\)/)
  assert.match(practice, /inSession && \(/)
  assert.match(practice, /<UpskillingView/)
  assert.match(practice, /!inSession && path\.data/)
})
