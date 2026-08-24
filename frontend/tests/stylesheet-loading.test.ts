/**
 * Every stylesheet in this repo must actually be loaded.
 *
 * `bfd99924` deleted `import "./screen-running.css"` from `preflight-gate.tsx`
 * and kept the sibling `preflight.css` line beside it. For two days nothing
 * imported that sheet, so 143 lines of rules never loaded: the Myro Search wait
 * screen's hero, its streaming reveal stack, its phase label and count — the
 * screen a user watches for 166-220s of a paid run — plus every number on the
 * "Run complete" screen after it. Found 2026-08-23, by eye, chasing something
 * else.
 *
 * An unimported stylesheet is the quietest failure in this codebase:
 *
 *   - `tsc` cannot typecheck a side-effect import that is not there.
 *   - A lint rule sees a well-formed file with no unused anything.
 *   - An orphan-RULE check (declared classes vs rendered ones) passes cleanly,
 *     because every class is still both declared and rendered. Different
 *     question entirely.
 *   - The file sits in the folder reading like live design, and in this case
 *     `screen-running.tsx` carried a comment asserting the shell imported it.
 *
 * Two traps this test was written around, both of which made a first draft
 * report a clean tree while the bug was reintroduced:
 *
 *   1. Match IMPORT SYNTAX, never "the filename appears in quotes somewhere".
 *      A test file listing "components/preflight/screen-running.css" in an
 *      array counts as a reference under the loose rule, and so does a doc
 *      comment naming the import that is missing.
 *   2. Strip comments first, for the same reason.
 *
 * Verified to fail with the real import removed — a guard that cannot fail is
 * worse than no guard.
 */
import { strict as assert } from "node:assert"
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { test } from "node:test"

const ROOT = new URL("../", import.meta.url).pathname

/** Root `public/` is served assets; `components/public/` is real source. */
function skip(rel: string): boolean {
  const parts = rel.split("/")
  if (parts[0] === "node_modules" || parts[0] === ".next" || parts[0] === "public") return true
  // Tests reference stylesheet paths as data; they never load one.
  return parts[0] === "tests"
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    const rel = relative(ROOT, abs)
    if (skip(rel)) continue
    if (entry.isDirectory()) walk(abs, out)
    else out.push(rel)
  }
  return out
}

const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** `import "x.css"` · `import s from "x.css"` · `@import "x.css"` · `require("x.css")` */
const IMPORT =
  /(?:^|\n)\s*(?:import\s+(?:[^'"\n]*\s+from\s+)?|@import\s+(?:url\()?)['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/gm

const files = walk(ROOT)
const sheets = files.filter((f) => f.endsWith(".css"))
const sources = files.filter((f) => /\.(ts|tsx|js|jsx|mjs|css)$/.test(f))

test("every stylesheet is imported by something", () => {
  assert.ok(sheets.length > 50, `only ${sheets.length} stylesheets found — the walk is wrong`)

  const imported = new Set<string>()
  for (const file of sources) {
    const text = stripComments(readFileSync(join(ROOT, file), "utf8"))
    for (const match of text.matchAll(IMPORT)) {
      const spec = match[1] ?? match[2]
      if (spec?.endsWith(".css")) imported.add(spec.split("/").pop()!)
    }
  }

  const orphans = sheets
    .filter((sheet) => !imported.has(sheet.split("/").pop()!))
    .sort()

  assert.deepEqual(
    orphans,
    [],
    `these stylesheets are imported by nothing and will never load:\n  ${orphans.join("\n  ")}`,
  )
})
