import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")

// ARCHITECTURE_ONE_PREP.md P3: the ₹199/₹599 offer sits in the Preparation
// room as well as under the Myro Score on the CV page (ENG6), and every order
// records the door it came through so the room's sales can be counted.

test("both kinds of room carry the offer, tagged as the room", () => {
  assert.match(read("components/preparations/prep-room.tsx"), /<PackOffer token=\{token\} surface="room" jobId=\{app\.job_id\} \/>/)
  assert.match(read("components/preparations/role-room.tsx"), /<PackOffer token=\{token\} surface="room" \/>/)
})

test("in a job room a held check is spent on that job, and a running one is not resold", () => {
  const offer = read("components/apply-pack/pack-offer.tsx")
  assert.match(offer, /spend\(held\.id, jobId\)/)
  assert.match(offer, /Use it on this job/)
  assert.match(offer, /c\.kind === "cv_job" && c\.job_id === jobId\)\) return null/)
  assert.match(offer, /<ApplyPackBuy jobId=\{jobId\} surface=\{surface\}/)
})

test("every buy door says which door it is", () => {
  const doors: Array<[string, RegExp]> = [
    ["app/(authed)/apply-pack/page.tsx", /<ApplyPackBuy surface="pack" \/>/],
    ["components/apply-pack/human-check-line.tsx", /surface="stakes"/],
    ["components/apply-pack/linkedin-check-card.tsx", /surface="linkedin"/],
    ["components/xp/XPGateModal.tsx", /surface="fuel"/],
    ["app/(authed)/filing/page.tsx", /surface: "filing"/],
    ["app/myrology/checkout.tsx", /surface: "myrology"/],
  ]
  for (const [file, door] of doors) assert.match(read(file), door, file)
  // Required, so a new door cannot forget to say.
  assert.match(read("components/apply-pack/apply-pack-buy.tsx"), /\n  surface: SaleSurface\n/)
  assert.match(read("lib/checkout.ts"), /\n  surface: SaleSurface\n/)
})

test("the client's doors are the API's doors", () => {
  const union = read("lib/api.ts").match(/export type SaleSurface = (.+)\n/)?.[1] ?? ""
  const client = new Set([...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]))
  const literal = read("../backend/app/routers/payments.py").match(/SaleSurface = Literal\[(.+)\]/)?.[1] ?? ""
  const server = new Set([...literal.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]))
  assert.ok(client.size > 0)
  assert.deepEqual(client, server)
})
