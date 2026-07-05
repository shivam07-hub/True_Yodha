import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const forgePage = readFileSync("app/(authed)/forge/page.tsx", "utf8")
const commandRail = readFileSync("components/mission-control/command-rail.tsx", "utf8")
const missionHeroRail = readFileSync("components/mission-control/mission-hero-rail.tsx", "utf8")

test("Forge does not duplicate the Jobs next-move rail", () => {
  assert.equal(forgePage.includes("<NextBestSteps"), false)
  assert.equal(forgePage.includes("components/home/next-best-steps"), false)
  assert.equal(forgePage.includes("deriveNextBestSteps"), false)

  assert.match(commandRail, /<CompactMoves steps={moves} \/>/)
  assert.match(missionHeroRail, /deriveNextBestSteps/)
})
