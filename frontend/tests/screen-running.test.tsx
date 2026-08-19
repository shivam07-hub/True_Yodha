import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { ScreenRunning } from "../components/preflight/screen-running"

test("a queued ticket says it is waiting, without inventing a phase or a count", () => {
  const html = renderToStaticMarkup(
    <ScreenRunning
      lifecycle="queued"
      label="Waiting to start"
      done={null}
      total={null}
      revealed={[]}
      contract={null}
    />,
  )
  assert.match(html, /Waiting to start/)
  // ADR-0009's phase list is the authority; no fabricated step names.
  assert.doesNotMatch(html, /Reading your signed-off order/)
  assert.doesNotMatch(html, /Scoring against your CV baseline/)
  assert.doesNotMatch(html, /Ranking by fit/)
  // Nothing revealed yet — no hero and no count.
  assert.doesNotMatch(html, /pf-run-hero/)
  assert.doesNotMatch(html, /pf-run-count/)
})

test("computing without a count uses the server label, not a fabricated one", () => {
  const html = renderToStaticMarkup(
    <ScreenRunning
      lifecycle="computing"
      label="Ranking with Myro"
      done={null}
      total={null}
      revealed={[]}
      contract={null}
    />,
  )
  assert.match(html, /Ranking with Myro/)
  assert.doesNotMatch(html, /Scoring against your CV baseline/)
  assert.doesNotMatch(html, /Ranking by fit/)
})

test("per-job reveal keeps the latest in the hero and the last few behind it", () => {
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
      contract={null}
    />,
  )
  // The hero is the latest; the count is a plain "N of M" numeric readout.
  assert.match(html, /pf-run-hero/)
  assert.match(html, /Tekion/)
  assert.match(html, /PM/)
  // The previous reveal falls into the stack behind the hero.
  assert.match(html, /pf-run-stack/)
  assert.match(html, /Acme · Eng/)
  // Count: numeric, tabular, "N of M". No progress bar, no invented percent.
  assert.match(html, /pf-run-count/)
  assert.match(html, />2</)
  assert.match(html, /of 15/)
  assert.doesNotMatch(html, /pf-run-track/)
  assert.doesNotMatch(html, /pf-run-fill/)
})

test("the contract line is pinned when the caller supplies one", () => {
  const html = renderToStaticMarkup(
    <ScreenRunning
      lifecycle="computing"
      label="Ranking with Myro"
      done={1}
      total={5}
      revealed={[{ company: "Acme", title: "Eng" }]}
      contract="Myro runs on the 3 lines above and nothing else."
    />,
  )
  assert.match(html, /Myro runs on the 3 lines above and nothing else\./)
  assert.match(html, /pf-contract/)
})

test("a reveal missing a title falls back to the company name in the hero", () => {
  const html = renderToStaticMarkup(
    <ScreenRunning
      lifecycle="computing"
      label="Ranking with Myro"
      done={1}
      total={5}
      revealed={[{ company: "Acme", title: null }]}
      contract={null}
    />,
  )
  assert.match(html, /pf-run-hero-title[^<]*>Acme</)
  // The `company` sub-line only appears when we have BOTH a title and a company.
  assert.doesNotMatch(html, /pf-run-hero-company/)
})
