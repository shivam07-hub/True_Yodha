import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")

// ARCHITECTURE_ONE_PREP.md P2. Step 2 said "You're L1 · this job asks L3" and
// then sent the person to /practice to do what the room was asking for. In the
// 30 days before, 3 people practised at all and the room's own drill
// (DrillPanel, the job calibration quiz) had never been used once.

test("a level row runs its set in the row, not on /practice", () => {
  const rows = read("components/preparations/level-rows.tsx")
  assert.match(rows, /<LevelPractice\b/)
  assert.doesNotMatch(rows, /\/practice\?skill=/)
  // One row open at a time: the open row is one piece of state.
  assert.match(rows, /useState<\{ key: string; level: number \} \| null>/)
})

test("a set started in a room is started by key and carries the room's job", () => {
  const practice = read("components/preparations/level-practice.tsx")
  assert.match(practice, /upskilling\.startSet\(token, skillKey, next, jobId\)/)
  // Every room asking for the skill moves after a pass: the ladder and the
  // role room's read are both invalidated.
  assert.match(practice, /dataKeys\.prepLadder\(\)/)
  assert.match(practice, /dataKeys\.careerSkillPath\(\)/)
  // Grading is the shared mapping, not a second copy of /practice's.
  assert.match(practice, /resultOf\(set, res, answers, elapsedSeconds\)/)
  assert.match(read("components/skills/upskilling/upskilling-view.tsx"), /resultOf\(quiz, res, answers, elapsedSeconds\)/)
})

test("the job room passes its job, the target-role room passes none", () => {
  assert.match(read("components/preparations/prep-room.tsx"), /<LevelRows [^>]*jobId=\{app\.job_id\}/)
  assert.match(read("components/preparations/role-room.tsx"), /<LevelRows [^>]*jobId=\{null\}/)
})

test("the never-used job drill is gone from the room", () => {
  assert.equal(existsSync(new URL("../components/preparations/drill-panel.tsx", import.meta.url)), false)
  assert.doesNotMatch(read("components/preparations/prep-room.tsx"), /DrillPanel|startGap/)
  assert.doesNotMatch(read("components/preparations/preparations.css"), /\.prp-step-drill|\.prp-drill-wrap/)
})

test("the api starts a set by id or by key, and sends the room's job only when there is one", () => {
  const api = read("lib/api.ts")
  assert.match(api, /startSet: \(token: string, skill: number \| string, level: number, jobId\?: string \| null\)/)
  assert.match(api, /typeof skill === "number" \? \{ skill_id: skill \} : \{ taxonomy_key: skill \}/)
  assert.match(api, /\.\.\.\(jobId \? \{ job_id: jobId \} : \{\}\)/)
})
