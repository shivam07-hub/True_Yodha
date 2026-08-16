/**
 * Step 1 has to show WHERE each skill came from.
 *
 * A first-run user is being asked to rule on a list of skills they never typed.
 * The only thing that makes that answerable is the line of their own CV Myro read
 * the skill out of — the same pointer the CV playground's Skills rail shows. The
 * shipped version printed that line as a truncated fragment beside each name, so
 * at 375px it clipped to a few words and repeated once per skill it produced.
 *
 * The `none` tier is the deliberate exception: its "evidence" is the skill's own
 * name echoed back (see lib/cv/skill-proof.ts), so quoting it would be the
 * platform claiming proof it does not hold.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { FirstRunSkillReview } from "../components/onboarding/first-run-skill-review"

const BULLET = "Edited 15+ advertisement and brand promotion videos"

type Skill = { taxonomy_key: string; name: string; level: number; evidence: string }

function render(skills: Skill[]): string {
  return renderToStaticMarkup(
    <FirstRunSkillReview
      token="t"
      result={{
        kind: "awaiting_skill_confirmation",
        baseline_version_id: 1,
        skills,
        journey_step: 1,
      } as never}
      onConfirmed={() => {}}
    />,
  )
}

const proven = (name: string, evidence = BULLET): Skill => ({
  taxonomy_key: name,
  name,
  level: 3,
  evidence,
})

test("a proven skill shows the CV line it was read from, in full", () => {
  const markup = render([proven("Video Editing Software")])

  assert.ok(markup.includes(BULLET), "the CV line must be on screen")
  assert.match(markup, /Video Editing Software/)
})

test("the CV line is never truncated", () => {
  const markup = render([proven("Video Editing Software")])

  // `truncate` clips to one line with an ellipsis — which is what made the
  // pointer unreadable on a phone. The quote must wrap instead.
  const quoteBlock = markup.slice(markup.indexOf(BULLET) - 200, markup.indexOf(BULLET))
  assert.doesNotMatch(quoteBlock, /truncate/)
})

test("skills from one CV line are grouped under it, not repeated per skill", () => {
  const markup = render([
    proven("Video Editing Software"),
    proven("Content Creation"),
    proven("Poster Design"),
  ])

  const occurrences = markup.split(BULLET).length - 1
  assert.equal(occurrences, 1, "one line, quoted once, with its skills beneath it")
  for (const name of ["Video Editing Software", "Content Creation", "Poster Design"]) {
    assert.ok(markup.includes(name))
  }
})

test("different CV lines stay separate", () => {
  const other = "Built and shipped a Django service handling 2M requests"
  const markup = render([proven("Video Editing Software"), proven("Django", other)])

  assert.ok(markup.includes(BULLET))
  assert.ok(markup.includes(other))
})

test("a keyword-only skill is never given a quote it does not have", () => {
  // Evidence that is just the skill's own name → tier `none`. Echoing it back
  // under the name would read as a receipt.
  const markup = render([{
    taxonomy_key: "Data Analysis",
    name: "Data Analysis",
    level: 1,
    evidence: "Data Analysis",
  }])

  assert.match(markup, /No proof yet/)
  assert.match(markup, /Found by keyword/)
  // The name renders once, as the checkbox label — not a second time as a quote.
  assert.equal(markup.split("Data Analysis").length - 1, 1)
})

test("every skill is still individually rulable", () => {
  const markup = render([proven("Video Editing Software"), proven("Content Creation")])

  assert.equal(markup.split('type="checkbox"').length - 1, 2)
})
