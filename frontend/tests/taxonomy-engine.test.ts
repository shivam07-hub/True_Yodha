import assert from "node:assert/strict"
import test from "node:test"
import { createTaxonomy, type TaxonomySources } from "../lib/taxonomy/taxonomy"

const SOURCES: TaxonomySources = {
  skeletonUrl: "/skeleton",
  priorityUrl: "/priority",
  indexUrl: "/index",
}

const SKELETON = {
  children: [
    { name: "Information Technology", clusters: [{ name: "Cloud", n: 3 }, { name: "Data", n: 2 }] },
    { name: "Business", clusters: [{ name: "Strategy", n: 1 }] },
  ],
}
const PRIORITY = {
  skills: [
    { name: "AWS", domain: "Information Technology", cluster: "Cloud", band: "very_high" },
    { name: "Kubernetes", domain: "Information Technology", cluster: "Cloud", band: "high" },
  ],
}
const FULL = {
  children: [
    {
      name: "Information Technology",
      children: [
        { name: "Cloud", children: [{ name: "AWS" }, { name: "Kubernetes" }, { name: "Azure Functions" }] },
        { name: "Data", children: [{ name: "DuckDB" }, { name: "Spark" }] },
      ],
    },
    { name: "Business", children: [{ name: "Strategy", children: [{ name: "OKRs" }] }] },
  ],
}

/** Controllable harness: resolve each URL on demand, fire idle manually, count it. */
function harness(overrides: Record<string, () => Promise<unknown>> = {}) {
  const data: Record<string, unknown> = { "/skeleton": SKELETON, "/priority": PRIORITY, "/index": FULL }
  let idleCb: (() => void) | null = null
  let idleScheduled = 0
  const engine = createTaxonomy(SOURCES, {
    fetchJson: (url) => (overrides[url] ? overrides[url]() : Promise.resolve(data[url])),
    scheduleIdle: (cb) => {
      idleScheduled += 1
      idleCb = cb
      return () => { idleCb = null }
    },
  })
  return {
    engine,
    fireIdle: () => idleCb?.(),
    idleScheduled: () => idleScheduled,
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

test("structure paints from skeleton alone; stats summed from counts", async () => {
  const { engine } = harness()
  engine.start()
  await tick()
  const v = engine.getSnapshot()
  assert.equal(v.readiness.structure, "ready")
  assert.deepEqual(v.stats, { domains: 2, clusters: 3, skills: 6 })
  assert.equal(v.domains[0]?.name, "Information Technology")
  assert.equal(v.domains[0]?.skills, 5)
  engine.destroy()
})

test("search is priority-scoped before index, all-scoped after", async () => {
  const h = harness()
  h.engine.start()
  await tick()
  let v = h.engine.getSnapshot()
  assert.equal(v.readiness.priority, "ready")
  assert.equal(v.demandOf("AWS"), "very_high")
  assert.equal(v.demandOf("Azure Functions"), null) // long-tail not a demand carrier

  assert.equal(v.search("a"), null) // <2 char guard
  const pri = v.search("az")
  assert.equal(pri?.scope, "priority")
  assert.equal(pri?.hits.length, 0) // Azure not in priority tier yet

  // index fires on idle, exactly once, only after priority
  assert.equal(h.idleScheduled(), 1)
  h.fireIdle()
  await tick()
  v = h.engine.getSnapshot()
  assert.equal(v.readiness.index, "ready")
  const all = v.search("az")
  assert.equal(all?.scope, "all")
  assert.equal(all?.hits.find((x) => x.name === "Azure Functions")?.domain, "Information Technology")
  h.engine.destroy()
})

test("skillsForCluster: priority-only+incomplete before index, merged+complete after", async () => {
  const h = harness()
  h.engine.start()
  await tick()
  let v = h.engine.getSnapshot()
  let cloud = v.skillsForCluster("Information Technology", "Cloud")
  assert.equal(cloud.complete, false)
  assert.deepEqual(cloud.skills.map((s) => s.name), ["AWS", "Kubernetes"])

  h.fireIdle()
  await tick()
  v = h.engine.getSnapshot()
  cloud = v.skillsForCluster("Information Technology", "Cloud")
  assert.equal(cloud.complete, true)
  // priority chips first, then deduped long tail
  assert.deepEqual(cloud.skills.map((s) => s.name), ["AWS", "Kubernetes", "Azure Functions"])
  assert.equal(cloud.skills[0]?.band, "very_high")
  assert.equal(cloud.skills[2]?.band, null)
  h.engine.destroy()
})

test("index is fetched at most once even across many notifications", async () => {
  let indexFetches = 0
  const h = harness({ "/index": () => { indexFetches += 1; return Promise.resolve(FULL) } })
  h.engine.start()
  await tick()
  h.fireIdle()
  h.fireIdle() // second manual fire must not schedule/refetch
  await tick()
  assert.equal(indexFetches, 1)
  h.engine.destroy()
})

test("a failing tier degrades that tier only", async () => {
  const h = harness({ "/priority": () => Promise.reject(new Error("boom")) })
  h.engine.start()
  await tick()
  const v = h.engine.getSnapshot()
  assert.equal(v.readiness.structure, "ready") // unaffected
  assert.equal(v.readiness.priority, "error")
  assert.equal(h.idleScheduled(), 0) // index never scheduled without priority
  h.engine.destroy()
})

test("snapshot identity is stable between state changes", async () => {
  const h = harness()
  h.engine.start()
  await tick()
  const a = h.engine.getSnapshot()
  const b = h.engine.getSnapshot()
  assert.equal(a, b) // same ref until next emit
  h.fireIdle()
  await tick()
  const c = h.engine.getSnapshot()
  assert.notEqual(a, c) // new ref after index ready
  h.engine.destroy()
})
