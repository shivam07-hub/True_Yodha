import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const css = readFileSync(new URL("../components/market/market-intel.css", import.meta.url), "utf8")

function rulesFor(selector) {
  const rules = []
  let start = css.indexOf(`${selector} {`)
  while (start !== -1) {
    const end = css.indexOf("}", start)
    assert.notEqual(end, -1, `${selector} rule should be closed`)
    rules.push(css.slice(start, end + 1))
    start = css.indexOf(`${selector} {`, end)
  }
  assert.notEqual(rules.length, 0, `${selector} rule should exist`)
  return rules
}

function ruleFor(selector) {
  return rulesFor(selector)[0]
}

test("desktop market rail owns a bounded scrollport below the sticky header", () => {
  const rail = rulesFor(".mi-rail").find((rule) => /position:\s*sticky/.test(rule))
  assert.ok(rail, "desktop .mi-rail rule should stay sticky")

  assert.match(
    rail,
    /max-height:\s*calc\(100dvh - var\(--tm-desktop-nav-h, 60px\) - var\(--mi-rail-top\) - var\(--mi-rail-bottom-gap\)\)/,
  )
  assert.match(rail, /overflow-y:\s*auto/)
  assert.match(rail, /-webkit-overflow-scrolling:\s*touch/)
})

test("company signals can hand wheel scroll back to the rail", () => {
  const list = ruleFor(".mi-company-list")

  assert.doesNotMatch(list, /overscroll-behavior:\s*contain/)
})
