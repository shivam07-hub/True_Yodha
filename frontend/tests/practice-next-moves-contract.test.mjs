import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const practicePage = readFileSync("app/(authed)/practice/page.tsx", "utf8")
const commandRail = readFileSync("components/mission-control/command-rail.tsx", "utf8")
const missionHeroRail = readFileSync("components/mission-control/mission-hero-rail.tsx", "utf8")

test("Practice does not duplicate the Jobs next-move rail", () => {
  assert.equal(practicePage.includes("<NextBestSteps"), false)
  assert.equal(practicePage.includes("components/home/next-best-steps"), false)
  assert.equal(practicePage.includes("deriveNextBestSteps"), false)

  assert.match(commandRail, /<CompactMoves steps={moves} \/>/)
  assert.match(missionHeroRail, /deriveNextBestSteps/)
})
