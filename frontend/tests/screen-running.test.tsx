import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { ScreenRunning } from "../components/preflight/screen-running"

test("a queued ticket says it is waiting, with no invented percent", () => {
  const html = renderToStaticMarkup(
    <ScreenRunning
      lifecycle="queued"
      label="Waiting to start"
      done={null}
      total={null}
      revealed={[]}
    />,
  )
  assert.match(html, /Waiting to start/)
  assert.doesNotMatch(html, /Reading your signed-off order/)
  assert.doesNotMatch(html, /Scanning/)
  assert.match(html, /width:\s*0%/)
})

test("computing without a count uses the server label, not a four-step play", () => {
  const html = renderToStaticMarkup(
    <ScreenRunning
      lifecycle="computing"
      label="Ranking with Myro"
      done={null}
      total={null}
      revealed={[]}
    />,
  )
  assert.match(html, /Ranking with Myro/)
  assert.doesNotMatch(html, /Scoring against your CV baseline/)
  assert.doesNotMatch(html, /Ranking by fit/)
})

test("per-job reveal is the progress the user can use", () => {
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
  assert.match(html, /Ranking 2 of 15/)
  assert.match(html, /Tekion · PM/)
  assert.match(html, /width:\s*13%/)
})
