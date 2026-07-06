import { test } from "node:test"
import assert from "node:assert/strict"
import { pickRelatedCompanies, type CompanyRef } from "../lib/companies/related"

function mk(n: number, industryOf?: (i: number) => string | null): CompanyRef[] {
  return Array.from({ length: n }, (_, i) => ({
    name: "C" + String(i).padStart(3, "0"),
    count: n - i,
    industry: industryOf ? industryOf(i) : null,
  }))
}

test("same-industry peers come first, ranked by count desc", () => {
  const all: CompanyRef[] = [
    { name: "Alpha", count: 5, industry: "BFSI" },
    { name: "Beta", count: 90, industry: "BFSI" },
    { name: "Gamma", count: 50, industry: "BFSI" },
    { name: "Delta", count: 99, industry: "Technology" },
    { name: "Echo", count: 10, industry: "Technology" },
  ]
  const out = pickRelatedCompanies(all, "Alpha", 24).map((c) => c.name)
  // Beta (90) then Gamma (50) — both BFSI, count desc — must precede any Technology co.
  assert.equal(out[0], "Beta")
  assert.equal(out[1], "Gamma")
  assert.ok(out.indexOf("Beta") < out.indexOf("Delta"))
})

test("never includes the current company or duplicates", () => {
  const all = mk(50, (i) => (i % 3 === 0 ? "A" : "B"))
  for (const cur of ["C000", "C025", "C049"]) {
    const out = pickRelatedCompanies(all, cur, 24)
    assert.ok(!out.some((c) => c.name === cur), `${cur} self-linked`)
    assert.equal(new Set(out.map((c) => c.name)).size, out.length, `${cur} has dups`)
  }
})

test("respects the limit", () => {
  const all = mk(268, (i) => "Ind" + (i % 8))
  for (const cur of ["C000", "C133", "C267"]) {
    assert.ok(pickRelatedCompanies(all, cur, 24).length <= 24)
  }
})

test("full mesh — every company receives inbound links, zero orphans", () => {
  // Mixed: some industries, some industry-less — the hardest case for coverage.
  const all = mk(268, (i) => (i % 5 === 0 ? null : "Ind" + (i % 7)))
  const inbound = new Map<string, number>(all.map((c) => [c.name, 0]))
  for (const c of all) {
    for (const r of pickRelatedCompanies(all, c.name, 24)) {
      inbound.set(r.name, (inbound.get(r.name) ?? 0) + 1)
    }
  }
  const counts = Array.from(inbound.values())
  assert.equal(counts.filter((x) => x === 0).length, 0, "orphan company with no inbound link")
  assert.ok(Math.min(...counts) >= 1)
})

test("industry-less company still gets a full ring of suggestions", () => {
  const all = mk(50, () => null) // no industry anywhere
  const out = pickRelatedCompanies(all, "C010", 24)
  assert.equal(out.length, 24)
  assert.ok(!out.some((c) => c.name === "C010"))
})

test("tiny list does not crash and excludes self", () => {
  const all: CompanyRef[] = [
    { name: "Solo", count: 1, industry: "X" },
    { name: "Duo", count: 2, industry: "Y" },
  ]
  assert.deepEqual(pickRelatedCompanies(all, "Solo", 24).map((c) => c.name), ["Duo"])
  assert.deepEqual(pickRelatedCompanies(all, "Solo", 24).length ? true : false, true)
  assert.deepEqual(pickRelatedCompanies([{ name: "Solo", count: 1 }], "Solo", 24), [])
})
