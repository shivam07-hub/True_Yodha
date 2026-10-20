/**
 * List Reading (ADR-0027): a full /market list stops reading, and Read more is
 * offered only then. The server decides (`can_read_more`); the client draws it.
 */
import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ReadMoreJobs } from "../components/market/read-more-jobs"
import type { MarketJudgment } from "../lib/api"

const base: MarketJudgment = {
  reading: false,
  read: 300,
  pending: 700,
  cleared: 40,
  notice: null,
  cause: null,
  skills: [],
}

const draw = (judgment: MarketJudgment | null) =>
  renderToStaticMarkup(<ReadMoreJobs judgment={judgment} onReadMore={async () => {}} />)

test("a full list with jobs left unread offers Read more", () => {
  const html = draw({ ...base, can_read_more: true })
  assert.match(html, /<button[^>]*type="button"[^>]*>Read more jobs<\/button>/)
})

test("a list still reading, or with nothing left, offers nothing", () => {
  assert.equal(draw({ ...base, can_read_more: false }), "")
  assert.equal(draw({ ...base, reading: true }), "")
  assert.equal(draw(null), "")
})
