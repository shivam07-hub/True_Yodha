import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const RAW = readFileSync("components/common/setup-nudge.tsx", "utf8")

/** The file with its prose removed. Both the docstring and the inline comments
 *  quote the very strings these tests look for — the fifth time this session a
 *  grep assertion has matched an explanation instead of the code. */
const NUDGE = RAW.split("\n")
  .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
  .join("\n")

test("the nudge names the step the user is actually on", () => {
  // It said "Pick a target role" to everyone with a CV and no target. 262 of
  // those 300 users have never confirmed their skills, so they were pointed
  // past the thing in their way at a step they cannot reach yet.
  assert.match(NUDGE, /Confirm your skills/)
  assert.match(NUDGE, /Pick a target role/)
  assert.match(NUDGE, /Upload your CV/)
})

test("skill confirmation is checked before the target", () => {
  const skills = NUDGE.indexOf("Confirm your skills")
  const target = NUDGE.indexOf("Pick a target role")
  assert.ok(skills > -1 && target > -1)
  assert.ok(skills < target, "the earlier unfinished step must win")
})

test("an absent flag never invents a blocker", () => {
  // Older payloads omit `skills_confirmed`. Defaulting to "unconfirmed" would
  // show "Confirm your skills" to people who already did.
  assert.match(NUDGE, /skills_confirmed !== false/)
})

test("a fully set-up user still sees nothing", () => {
  assert.match(NUDGE, /if \(hasCv && hasTargetRoles && skillsConfirmed\) return null/)
})

test("it still reads the fact, never a flag", () => {
  // `onboarding_complete` was true for 111 users with no target role. A flag is
  // not the fact.
  assert.ok(!NUDGE.includes("onboarding_complete"))
})
