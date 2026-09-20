import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

test("the score chip shows standing and Recalculate beside the number, not inside the link", () => {
  const chip = read("components/nav/score-chip.tsx")
  assert.match(chip, /standingLine/)
  assert.match(chip, /scores\.compute/)
  assert.match(chip, /Recalculate/)
  assert.match(chip, /SCORE_FORMULA_VERSION/)
  assert.match(chip, /tm-score-chip-wrap/)
  assert.doesNotMatch(chip, /<Link[\s\S]*<button[\s\S]*<\/Link>/)
})

test("mobile chrome carries the same chip so Recalculate is reachable at 375", () => {
  assert.match(read("mobile/shell.tsx"), /<ScoreChip \/>/)
})

test("docs no longer describe an equal-weight domain mean", () => {
  const docs = read("components/docs/scoring-section.tsx")
  assert.doesNotMatch(docs, /mean of domains where/)
  assert.match(docs, /averaged by how\s+many skills hold them up/)
})
