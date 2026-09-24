import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"

const ROOT = new URL("../", import.meta.url)
const SKIP_CSS = new Set([
  "app/design-tokens.css",
  "app/(authed)/cv/cv-sheet.css",
  "app/(authed)/cv/cv-fonts.css",
])
const SKIP_TSX = new Set([
  "components/cv/builder/live-preview.tsx",
  "app/opengraph-image.tsx",
  "app/profile/[ninja]/opengraph-image.tsx",
])

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === ".next" || name === "node_modules") continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, ext, out)
    else if (name.endsWith(ext)) out.push(full)
  }
  return out
}

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const relOf = (full: string) => relative(new URL(".", ROOT).pathname, full).replace(/\\/g, "/")

test("product CSS is on the six rungs: no 999 pills, no 700, no ui aliases", () => {
  const debt: string[] = []
  for (const full of walk(new URL(".", ROOT).pathname, ".css")) {
    const rel = relOf(full)
    if (SKIP_CSS.has(rel) || rel.includes("/reach/")) continue
    const css = code(readFileSync(full, "utf8"))
    if (/font-size:\s*[0-9.]+px/.test(css)) debt.push(`${rel} raw px font-size`)
    if (/font-weight:\s*[78]/.test(css)) debt.push(`${rel} weight 700+`)
    if (/border-radius:\s*99/.test(css)) debt.push(`${rel} 999 pill`)
    if (/--tm-fs-ui\b/.test(css)) debt.push(`${rel} --tm-fs-ui`)
  }
  assert.deepEqual(debt, [])

  const tokens = readFileSync(new URL("app/design-tokens.css", ROOT), "utf8")
  assert.doesNotMatch(tokens, /--tm-fs-ui\b/)
  assert.match(readFileSync(new URL("app/(authed)/cv/cv-sheet.css", ROOT), "utf8"), /font-weight:\s*700/)
})

test("product TSX chrome is on the six rungs: no 999 pills, no 700, no raw px type", () => {
  const debt: string[] = []
  for (const full of walk(new URL(".", ROOT).pathname, ".tsx")) {
    const rel = relOf(full)
    if (SKIP_TSX.has(rel) || rel.includes("/reach/")) continue
    const src = code(readFileSync(full, "utf8"))
    if (/fontSize:\s*\d/.test(src)) debt.push(`${rel} raw fontSize`)
    if (/fontWeight:\s*(650|7\d{2}|8\d{2})\b/.test(src)) debt.push(`${rel} weight 700+`)
    if (/borderRadius:\s*(99|999|16)\b/.test(src)) debt.push(`${rel} 999/16 pill`)
  }
  assert.deepEqual(debt, [])
})

test("phone Collections is on 4/6/8/10 and the six rungs", () => {
  const files = [
    "mobile/redesign/collections-surface.tsx",
    "mobile/redesign/collection-card.tsx",
    "mobile/redesign/add-job-sheet.tsx",
  ]
  for (const rel of files) {
    const src = code(readFileSync(new URL(rel, ROOT), "utf8"))
    assert.doesNotMatch(src, /fontWeight:\s*(650|7\d{2}|8\d{2})\b/, rel)
    assert.doesNotMatch(src, /fontSize:\s*\d/, rel)
    assert.doesNotMatch(src, /borderRadius:\s*(11|12|13|14|16|99|999)\b/, rel)
  }
  // The phone jobs surface, spot-checked on the rungs it actually uses. The `9`
  // pinned here was the segmented sort toggle's wrapper; the toggle went with the
  // sort it toggled, so pinning it would have held a control in place by test.
  const jobs = code(readFileSync(new URL("mobile/redesign/jobs-surface.tsx", ROOT), "utf8"))
  assert.match(jobs, /borderRadius: 7/)
  assert.match(jobs, /borderRadius: 14/)
  assert.doesNotMatch(jobs, /borderRadius:\s*(11|12|13|16|99|999)\b/)
})
