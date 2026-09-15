import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"

const ROOT = new URL("../", import.meta.url)
const SKIP = new Set([
  "app/design-tokens.css",
  "app/(authed)/cv/cv-sheet.css",
  "app/(authed)/cv/cv-fonts.css",
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === ".next" || name === "node_modules") continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (name.endsWith(".css")) out.push(full)
  }
  return out
}

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

test("product CSS is on the six rungs: no 999 pills, no 700, no ui aliases", () => {
  const files = walk(new URL(".", ROOT).pathname)
  const debt: string[] = []
  for (const full of files) {
    const rel = relative(new URL(".", ROOT).pathname, full).replace(/\\/g, "/")
    if (SKIP.has(rel) || rel.includes("/reach/")) continue
    const css = code(readFileSync(full, "utf8"))
    if (/font-size:\s*[0-9.]+px/.test(css)) debt.push(`${rel} raw px font-size`)
    if (/font-weight:\s*7/.test(css)) debt.push(`${rel} weight 700+`)
    if (/border-radius:\s*99/.test(css)) debt.push(`${rel} 999 pill`)
    if (/--tm-fs-ui\b/.test(css)) debt.push(`${rel} --tm-fs-ui`)
  }
  assert.deepEqual(debt, [])

  const tokens = readFileSync(new URL("app/design-tokens.css", ROOT), "utf8")
  assert.doesNotMatch(tokens, /--tm-fs-ui\b/)
  assert.match(readFileSync(new URL("app/(authed)/cv/cv-sheet.css", ROOT), "utf8"), /font-weight:\s*700/)
})
