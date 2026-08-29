import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { itemId } from "../lib/cv-compose"
import type { CVStructured } from "../lib/api"
import {
  applyBulletMove,
  arrangeByText,
  collapseKey,
  defaultExpanded,
  moveItem,
  neighbourIndex,
  occurrences,
  permutation,
  remapHiddenIids,
} from "../components/cv/builder/cv-pointer-order"

const cv = (bullets: string[]): CVStructured => ({
  contact: { name: "", title: "", email: "", phone: "", location: "", linkedin: "" },
  summary: "",
  education: [],
  experience: [{ company: "Hitachi", role: "Lead", dates: "", location: "", bullets }],
  projects: [],
  skills_line: "",
  certs: [],
})

test("moveItem reorders within a role and leaves neighbours in place", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"])
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"])
  assert.deepEqual(moveItem(["a", "b", "c"], 1, 1), ["a", "b", "c"])
})

test("applyBulletMove writes experience[].bullets — the same field onPatch already owns", () => {
  const next = applyBulletMove(cv(["one", "two", "three"]), "experience", 0, 0, 2)
  assert.deepEqual(next.experience[0].bullets, ["two", "three", "one"])
})

test("remapHiddenIids follows the bullet, not the slot", () => {
  const bullets = ["alpha line", "beta line"]
  const hidden = new Set([itemId("exp_bullet", 0, "alpha line")])
  const next = remapHiddenIids(hidden, "exp_bullet", 0, bullets, 0, 1)
  assert.equal(next.has(itemId("exp_bullet", 1, "alpha line")), true)
  assert.equal(next.has(itemId("exp_bullet", 0, "alpha line")), false)
  assert.equal(next.has(itemId("exp_bullet", 0, "beta line")), false)
})

test("defaultExpanded keeps fix-focused lines open and collapses a long on-target list", () => {
  assert.equal(defaultExpanded({ bulletCount: 6, tone: "on-target", isOpen: false, isEditing: false }), false)
  assert.equal(defaultExpanded({ bulletCount: 6, tone: "blocking", isOpen: false, isEditing: false }), true)
  assert.equal(defaultExpanded({ bulletCount: 6, isOpen: true, isEditing: false }), true)
  assert.equal(defaultExpanded({ bulletCount: 2, tone: "on-target", isOpen: false, isEditing: false }), true)
})

test("collapse keys follow text so a reorder does not expand a neighbour", () => {
  assert.deepEqual(occurrences(["same", "same", "other"]), [0, 1, 0])
  assert.equal(collapseKey("same", 1), "1:same")
  assert.deepEqual(permutation(0, 2, 3), [1, 2, 0])
  assert.equal(neighbourIndex(0, -1, 3), null)
  assert.equal(neighbourIndex(0, 1, 3), 1)
})

test("arrangeByText keeps live row data while the parent order is still catching up", () => {
  const rows = [
    { text: "a", flag: 1 },
    { text: "b", flag: 2 },
  ]
  assert.deepEqual(arrangeByText(rows, ["b", "a"]).map(r => r.text), ["b", "a"])
  assert.equal(arrangeByText(rows, ["b", "a"])[0].flag, 2)
})
test("the pointer row discloses with a chevron and a grab handle", () => {
  const row = readFileSync(new URL("../components/cv/builder/cv-line-row.tsx", import.meta.url), "utf8")
  const list = readFileSync(new URL("../components/cv/builder/cv-pointer-list.tsx", import.meta.url), "utf8")
  assert.match(row, /aria-expanded/)
  assert.match(row, /aria-controls/)
  assert.match(row, /chevron-down/)
  assert.match(row, /Collapse pointer/)
  assert.match(list, /aria-grabbed/)
  assert.match(list, /ArrowUp/)
  assert.match(list, /@dnd-kit\/core/)
})
