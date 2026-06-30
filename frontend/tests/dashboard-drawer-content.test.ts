import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const detailBody = readFileSync(new URL("../components/dashboard/detail-body.tsx", import.meta.url), "utf8")

test("dashboard job drawer keeps the job description directly after skill match context", () => {
  const matchIndex = detailBody.indexOf("You already match")
  const descriptionIndex = detailBody.indexOf("Job description")
  const companyIndex = detailBody.indexOf(">Company<")

  assert.ok(matchIndex >= 0, "drawer should show matched skills")
  assert.ok(descriptionIndex >= 0, "drawer should show the job description")
  assert.ok(companyIndex >= 0, "drawer should keep company intel available")
  assert.ok(matchIndex < descriptionIndex, "job description should sit below matched skills")
  assert.ok(descriptionIndex < companyIndex, "company intel should not push the job description down")
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
