import test from "node:test"
import assert from "node:assert/strict"

import {
  claimableForgeMinutes,
  claimableForgeXP,
  forgeElapsedSeconds,
  forgeProgressRatio,
} from "../lib/forge-progress"

test("forge elapsed seconds clamp to the active session duration", () => {
  assert.equal(forgeElapsedSeconds(1500, 1495), 5)
  assert.equal(forgeElapsedSeconds(1500, -30), 1500)
  assert.equal(forgeElapsedSeconds(1500, 1800), 0)
})

test("forge XP becomes claimable only after whole minutes accrue", () => {
  assert.equal(claimableForgeMinutes(1500, 1441), 0)
  assert.equal(claimableForgeMinutes(1500, 1440), 1)
  assert.equal(claimableForgeXP(1500, 960, 2), 18)
})

test("forge progress reports elapsed progress toward the soft cap", () => {
  assert.equal(forgeProgressRatio(1500, 1500), 0)
  assert.equal(forgeProgressRatio(1500, 750), 0.5)
  assert.equal(forgeProgressRatio(1500, 0), 1)
})
