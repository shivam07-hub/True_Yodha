import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  PUBLIC_SCORE_DOMAINS,
  SCORE_ENGINE_FACTS,
  workedClusterScore,
} from "../lib/score-methodology"

const frontendRoot = join(process.cwd())

test("score methodology publishes the locked 10 public domains", () => {
  assert.deepEqual(
    PUBLIC_SCORE_DOMAINS.map((domain) => domain.short),
    ["Tech", "Engineering", "Growth", "Sales", "Finance", "People", "Design", "Law", "Research", "Health"],
  )
})

test("score methodology mirrors the backend cluster formula", () => {
  const score = workedClusterScore({ userSkillCount: 2, totalClusterSkills: 50, strongestLevel: 2 })

  assert.equal(score.coverage, 0.2794)
  assert.equal(score.clusterScore, 19.8)
  assert.equal(SCORE_ENGINE_FACTS.totalScoreMethod, "mean_of_domains_with_evidence")
})

test("docs scoring section exists and primary score surfaces link to it", () => {
  assert.equal(existsSync(join(frontendRoot, "app/docs/page.tsx")), true)

  const scoreRingSource = readFileSync(join(frontendRoot, "components/skills/score-ring.tsx"), "utf8")
  const uploadSource = readFileSync(join(frontendRoot, "components/cv/cv-score-progress.tsx"), "utf8")

  assert.match(scoreRingSource, /href="\/docs#scoring"/)
  assert.match(uploadSource, /href="\/docs#scoring"/)
})
