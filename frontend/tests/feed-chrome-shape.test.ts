import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

test("shared feed chrome uses the six rungs, weight 600, and hard radii", () => {
  for (const file of [
    "components/jobs/feed-card.css",
    "components/dashboard/dashboard.css",
  ]) {
    const css = code(file)
    assert.doesNotMatch(css, /font-size:\s*[0-9.]+px/, `${file} still free-types a size`)
    assert.doesNotMatch(css, /font-weight:\s*7/, `${file} still uses 700+`)
    assert.doesNotMatch(css, /font-weight:\s*650/, `${file} still uses a weight above 600`)
    assert.doesNotMatch(css, /border-radius:\s*99/, `${file} still uses a pill radius`)
    assert.match(css, /--tm-fs-caption/, `${file} should use caption`)
    assert.match(css, /--tm-fs-body/, `${file} should use body`)
    assert.match(css, /--tm-button-radius/, `${file} should use the button radius`)
  }
})
