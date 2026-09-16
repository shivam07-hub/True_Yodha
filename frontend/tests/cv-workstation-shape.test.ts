import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const CHROME = [
  "app/(authed)/cv/cv-workstation.css",
  "app/(authed)/cv/cv-workstation-rail.css",
  "app/(authed)/cv/cv-workstation-chrome.css",
  "app/(authed)/cv/playground-v2.css",
  "app/(authed)/cv/playground-v2-rail.css",
]

test("CV is a workspace: 360 rail against a fluid room", () => {
  const shell = code("components/cv/builder/workstation-shell.tsx")
  const live = code("app/(authed)/cv/playground-v2.css")
  const skel = code("components/loading/route-loading/skeleton-mirrors/cv-workstation-skeleton.tsx")
  const tokens = read("app/design-tokens.css")

  assert.match(shell, /className="cvb-v2-main"/)
  assert.ok(shell.indexOf("cvb-v2-editor") < shell.indexOf("<WorkstationRail"))
  assert.match(live, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--tm-workspace-rail\)/)
  assert.doesNotMatch(live, /320px/)
  assert.match(tokens, /--tm-workspace-rail:\s*360px/)

  assert.match(skel, /var\(--tm-workspace-rail\)/)
  assert.doesNotMatch(skel, /400px/)
  assert.match(skel, /<CVMobileWorkstationSkeleton\s*\/>/)
})

test("CV chrome uses the six rungs; Geist stays on the sheet", () => {
  for (const file of CHROME) {
    const css = code(file)
    assert.doesNotMatch(css, /font-size:\s*[0-9.]+px/, `${file} still free-types a size`)
    assert.doesNotMatch(css, /font-weight:\s*7/, `${file} still uses 700+`)
    assert.doesNotMatch(css, /border-radius:\s*99/, `${file} still uses a pill radius`)
    assert.doesNotMatch(css, /--tm-fs-ui\b/, `${file} still uses a ui alias`)
    assert.doesNotMatch(css, /font-style:\s*italic/, `${file} still italicises chrome`)
  }

  const sheet = read("app/(authed)/cv/cv-sheet.css")
  const fonts = read("app/(authed)/cv/cv-fonts.css")
  assert.match(sheet, /font-family:\s*"Geist"/)
  assert.match(fonts, /font-family:\s*"Geist"/)
  assert.doesNotMatch(code("app/(authed)/cv/cv-sheet.css"), /--tm-font-sans/)
})
