/**
 * One verb on the job playground: Tailor with Mentor lives on the header,
 * priced. The Skills map is not a second door. A zeroed Match meter is hidden
 * until coverage has something to score.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const view = read("components/cv/builder/playground-view.tsx")
const panel = read("components/cv/builder/coverage-panel.tsx")
const header = read("components/cv/builder/playground-header.tsx")

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

test("Tailor with Mentor is one header door, with the cost on that control", () => {
  assert.match(view, /leadLabel=\{tailor\.showLead \? "Tailor with Mentor" : undefined\}/)
  assert.match(view, /leadCost=\{tailor\.leadCost\}/)
  assert.match(view, /onLead=\{tailor\.showLead \? tailor\.onHeader : undefined\}/)
  assert.match(view, /useTailorLanding/)
  assert.doesNotMatch(view, /railFooter/)
  assert.doesNotMatch(code(panel), /Tailor with Mentor/)
  assert.doesNotMatch(code(panel), /onOpenWeave/)
  assert.doesNotMatch(code(panel), /Close gaps/)
})

test("a Skills row still opens that gap — enter at that line", () => {
  assert.match(panel, /onOpenGaps\(r\.requirement\)/)
  assert.match(panel, /is-static/)
  assert.match(view, /focusRequirement=\{tailor\.focusGap\}/)
  assert.match(view, /onOpenGaps=\{tailor\.openGapsMap\}/)
})

test("Match hides the meter until coverage can score — a zeroed bar is not 0", () => {
  assert.match(view, /hideScore=\{!m\.hasSemantic\}/)
  assert.match(header, /A zeroed meter is not a neutral placeholder/)
})
