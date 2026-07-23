import test from "node:test"
import assert from "node:assert/strict"

import { domainClusterCount, placeSkill, type PlacementSource } from "../lib/skill-placement"
import type { SkillRoomModel } from "../lib/skill-room"

const room: SkillRoomModel = {
  skill: {
    key: "quantum_computing",
    display_name: "Quantum Computing",
    level: 2,
    proficiency_title: "Practitioner",
    evidence_text: "Built a QAOA prototype",
    forge_sessions_count: 1,
    forged_level_up_available: false,
  },
  domain: "Science and Research",
  cluster: "Quantum and Emerging Compute",
  clusterSize: 2,
  gap: null,
  evidence: "Built a QAOA prototype",
  sessionsToNext: 2,
  atMax: false,
}

const source: PlacementSource = {
  stats: { domains: 31, clusters: 442, skills: 35108 },
  domains: [{ name: "Science and Research", clusters: 18, skills: 1902 }],
  clustersOf: (domain) =>
    domain === "Science and Research" ? [{ name: "Quantum and Emerging Compute", n: 78 }] : [],
  demandOf: (name) => (name === "Quantum Computing" ? "high" : null),
}

test("the skill is located with the real scale at each rung", () => {
  const p = placeSkill(room, source)
  assert.ok(p)
  assert.equal(p.domainClusters, 18)
  assert.equal(p.clusterSkills, 78)
  assert.equal(p.totals?.skills, 35108)
  assert.equal(p.band, "high")
})

test("the user's own count in the cluster is never confused with the global count", () => {
  const p = placeSkill(room, source)
  assert.equal(p?.userSkillsInCluster, 2)
  assert.equal(p?.clusterSkills, 78)
})

test("an uncatalogued cluster reports null rather than an invented denominator", () => {
  const p = placeSkill({ ...room, cluster: "Not In The Catalogue" }, source)
  assert.equal(p?.clusterSkills, null)
  assert.equal(p?.domainClusters, 18)
})

test("an uncatalogued domain drops both nested counts, keeping totals", () => {
  const p = placeSkill({ ...room, domain: "Astral Projection" }, source)
  assert.equal(p?.domainClusters, null)
  assert.equal(p?.clusterSkills, null)
  assert.equal(p?.totals?.domains, 31)
})

test("matching tolerates case and surrounding whitespace", () => {
  const p = placeSkill({ ...room, cluster: "  quantum and emerging compute " }, source)
  assert.equal(p?.clusterSkills, 78)
})

test("no taxonomy loaded yet means no placement block at all", () => {
  assert.equal(placeSkill(room, null), null)
})

test("a taxonomy that resolved nothing renders nothing", () => {
  const empty: PlacementSource = { stats: null, domains: [], clustersOf: () => [], demandOf: () => null }
  assert.equal(placeSkill(room, empty), null)
})

test("demand band is absent, not zeroed, for a skill outside the priority set", () => {
  const p = placeSkill({ ...room, skill: { ...room.skill, display_name: "Basket Weaving" } }, source)
  assert.equal(p?.band, null)
})

test("domainClusterCount gives the real cluster count for an unevidenced domain's empty state (Q7)", () => {
  assert.equal(domainClusterCount("Science and Research", source), 18)
})

test("domainClusterCount tolerates case and whitespace, same convention as placeSkill", () => {
  assert.equal(domainClusterCount("  SCIENCE and research ", source), 18)
})

test("domainClusterCount reports null for an uncatalogued domain — never an invented number", () => {
  assert.equal(domainClusterCount("Astral Projection", source), null)
})

test("domainClusterCount reports null with no taxonomy loaded yet", () => {
  assert.equal(domainClusterCount("Science and Research", null), null)
})
