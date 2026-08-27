import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { ScreenDone, ScreenRunning } from "../components/preflight/screen-running"

test("a queued ticket keeps the count slot, without inventing a phase", () => {
  const html = renderToStaticMarkup(
    <ScreenRunning
      lifecycle="queued"
      label="Waiting to start"
      done={null}
      total={null}
      revealed={[]}
    />,
  )
  // ADR-0009's phase list is the authority; no fabricated step names.
  assert.doesNotMatch(html, /Reading your signed-off order/)
  assert.doesNotMatch(html, /Scoring against your CV baseline/)
  assert.doesNotMatch(html, /Ranking by fit/)
  // The count is the thesis even before the first reveal — never an empty hole.
  assert.match(html, /pf-run-count/)
  assert.match(html, /of —/)
  assert.doesNotMatch(html, /pf-run-hero/)
  assert.doesNotMatch(html, /pf-contract/)
})

test("computing without a count still does not fabricate a phase", () => {
  const html = renderToStaticMarkup(
    <ScreenRunning
      lifecycle="computing"
      label="Ranking with Myro"
      done={null}
      total={null}
      revealed={[]}
    />,
  )
  assert.doesNotMatch(html, /Scoring against your CV baseline/)
  assert.doesNotMatch(html, /Ranking by fit/)
  assert.match(html, /pf-run-count/)
})

test("the count is the hero; the tape is the last few jobs, latest first", () => {
  const html = renderToStaticMarkup(
    <ScreenRunning
      lifecycle="computing"
      label="Ranking with Myro"
      done={2}
      total={15}
      revealed={[
        { company: "Acme", title: "Eng" },
        { company: "Tekion", title: "PM" },
      ]}
    />,
  )
  assert.match(html, /pf-run-count/)
  assert.match(html, />2</)
  assert.match(html, /of 15/)
  assert.doesNotMatch(html, /pf-run-hero/)
  assert.doesNotMatch(html, /pf-run-track/)
  assert.doesNotMatch(html, /pf-run-fill/)
  // Latest job first. One line each, company · title.
  assert.match(html, /pf-run-tape/)
  const tekionAt = html.indexOf("Tekion · PM")
  const acmeAt = html.indexOf("Acme · Eng")
  assert.ok(tekionAt >= 0 && acmeAt >= 0 && tekionAt < acmeAt)
})

test("a job missing a title falls back to the company name", () => {
  const html = renderToStaticMarkup(
    <ScreenRunning
      lifecycle="computing"
      label="Ranking with Myro"
      done={1}
      total={5}
      revealed={[{ company: "Acme", title: null }]}
    />,
  )
  assert.match(html, /Acme/)
  assert.doesNotMatch(html, /Acme ·/)
})

test("done is one number and a verb, not a restated consent", () => {
  const html = renderToStaticMarkup(
    <ScreenDone matches={12} onSeeMatches={() => {}} onRunAgain={() => {}} />,
  )
  assert.match(html, /12/)
  assert.match(html, /matches/)
  assert.match(html, /See 12 matches/)
  assert.match(html, /Run it again/)
  assert.doesNotMatch(html, /strong matches/i)
  assert.doesNotMatch(html, /ranked against your CV/i)
  assert.doesNotMatch(html, /signed off/)
  assert.doesNotMatch(html, /left unanswered/)
})
