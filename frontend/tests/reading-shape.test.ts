import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const FILES = [
  "components/preparations/audit-room.css",
  "app/newsletter/newsletter.css",
  "app/newsletter/newsletter-figures.css",
  "app/newsletter/newsletter-index.module.css",
  "components/newsletter/issue-card.module.css",
  "components/newsletter/rail.module.css",
]

test("audit artifact and newsletter are a 68ch Newsreader column", () => {
  const audit = code("components/preparations/audit-room.css")
  assert.match(audit, /max-width:\s*var\(--tm-reading-measure\)/)
  assert.match(audit, /\.awr-doc \{[\s\S]*?font-family:\s*var\(--tm-font-reading\)/)
  assert.match(audit, /\.awr-doc \{[\s\S]*?font-size:\s*var\(--tm-fs-reading\)/)
  assert.doesNotMatch(audit, /--tm-fs-ui\b/)

  const globals = code("app/globals.css")
  const prose = globals.slice(globals.indexOf(".newsletter-prose {"))
  assert.match(prose, /font-family:\s*var\(--tm-font-reading\)/)
  assert.match(prose, /font-size:\s*var\(--tm-fs-reading\)/)
  assert.match(globals, /\.nl-article > \*:not\(\.nl-fullbleed\) \{[\s\S]*?max-width:\s*var\(--tm-reading-measure\)/)
  assert.doesNotMatch(prose.slice(0, 800), /font-style:\s*italic/)
  assert.doesNotMatch(code("app/globals.css").slice(
    code("app/globals.css").indexOf(".nl-standfirst"),
    code("app/globals.css").indexOf(".newsletter-prose"),
  ), /font-style:\s*italic/)

  const tokens = read("app/design-tokens.css")
  assert.match(tokens, /--tm-fs-reading:\s*1rem/)
  assert.match(tokens, /--tm-reading-measure:\s*68ch/)
})

test("reading chrome uses the six rungs, weight 600, no 999 pills", () => {
  for (const file of FILES) {
    const css = code(file)
    assert.doesNotMatch(css, /font-size:\s*[0-9.]+px/, `${file} still free-types a size`)
    assert.doesNotMatch(css, /font-size:\s*[0-9.]+rem/, `${file} still free-types a rem size`)
    assert.doesNotMatch(css, /font-weight:\s*7/, `${file} still uses 700+`)
    assert.doesNotMatch(css, /border-radius:\s*99/, `${file} still uses a pill radius`)
    assert.doesNotMatch(css, /--tm-fs-ui\b/, `${file} still uses a ui alias`)
  }
})
