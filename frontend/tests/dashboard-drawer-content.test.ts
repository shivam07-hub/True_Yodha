import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const detailBody = readFileSync(new URL("../components/dashboard/detail-body.tsx", import.meta.url), "utf8")

// Section ORDER is deliberately not asserted here any more. It moved into
// `lib/jobs/detail-model.ts`, which both the desktop drawer and the mobile
// sheet render from, and `detail-model.test.ts` already covers it for both
// skins ("full-data desktop render follows the funnel order", "mobile subset —
// order preserved"). Re-deriving order from the character offsets of literal
// strings in ONE skin's JSX asserted less, broke on the refactor that made the
// contract shared, and would have gone on passing if the mobile skin drifted.
test("dashboard job drawer still mounts the skill match and company slots", () => {
  assert.match(detailBody, /You already match/, "drawer should show matched skills")
  assert.match(detailBody, /Company report/, "drawer should keep company intel available")
})

test("dashboard job drawer uses short company report copy", () => {
  assert.ok(detailBody.includes("Company report"), "company CTA should name the destination")
  assert.equal(
    detailBody.includes("open the company report above"),
    false,
    "drawer should not explain a button the user can already see",
  )
  assert.equal(
    detailBody.includes("See verified reviews"),
    false,
    "company intel copy should stay compact inside the job drawer",
  )
})
