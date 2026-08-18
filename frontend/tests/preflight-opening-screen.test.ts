import { strict as assert } from "node:assert"
import { test } from "node:test"

import { openingScreen } from "../lib/preflight/opening-screen"

test("a signed-off order opens on review", () => {
  assert.equal(openingScreen({ last_run_at: "2026-08-18T10:00:00Z" }, false), "ready")
})

test("no prior run opens on name-the-work", () => {
  assert.equal(openingScreen({ last_run_at: null }, false), "start")
})

test("start over ignores the stored run", () => {
  assert.equal(openingScreen({ last_run_at: "2026-08-18T10:00:00Z" }, true), "start")
})

test("the order has to load before a screen is chosen", () => {
  assert.equal(openingScreen(undefined, false), null)
})
