import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const LINE = readFileSync("components/preparations/plan-line.tsx", "utf8")
const ROOM = readFileSync("components/preparations/prep-room.tsx", "utf8")

test("the plan finally has an entry point", () => {
  // It sold nothing for months, and the reason was structural: zero links to
  // /job-switch-plan existed anywhere in the app.
  assert.match(LINE, /href="\/job-switch-plan"/)
  assert.match(ROOM, /<PlanLine token=\{token\} \/>/)
})

test("the offer sits beside the CV that was actually sent", () => {
  // "Is this CV right for this job" is a question asked right after applying,
  // never on a pricing page. The line lives in the On record section.
  const record = ROOM.split('<Section label="On record">')[1]
  assert.ok(record.includes("<PlanLine"))
  assert.ok(record.indexOf("Applied") < record.indexOf("<PlanLine"))
})

test("a closed application is not sold to", () => {
  // The job is over. Offering CV guidance for it reads as not paying attention.
  const record = ROOM.split('<Section label="On record">')[1]
  assert.match(record, /stage !== "closed" \? \(/)
})

test("nothing is offered until the plan state is known", () => {
  // An offer that pops in a beat later, over content the reader has started, is
  // worse than one that arrives with its section.
  assert.match(LINE, /if \(planQ\.isLoading\) return null/)
})

test("an existing plan shows its state instead of the price", () => {
  assert.match(LINE, /Your review is on the way/)
  assert.match(LINE, /Your plan/)
  const owned = LINE.split("if (!plan)")[1].split("const pending")[1]
  assert.ok(!owned.includes("₹99"))
})

test("the offer carries its price", () => {
  assert.match(LINE, /₹99/)
})

test("copy carries no prose em dash", () => {
  const strings = LINE.match(/>[^<>{}\n]{12,}</g) ?? []
  for (const s of strings) assert.ok(!s.includes("—"), `em dash in UI copy: ${s}`)
})
