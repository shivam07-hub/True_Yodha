import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * ⚠️ MAINTENANCE CONTRACT — read before "fixing" a failure here.
 *
 * `tsc --noEmit` (CI `npm run typecheck`) uses this target. TypeScript defaults
 * to ES5 when it is omitted, so spreading a Map/Set iterator is TS2802 even
 * though Next/SWC emit modern JS and `next build` never type-checks tests.
 * ES2017 is Next's documented floor. Raise it in the same commit if the
 * platform's real language floor moves; do not delete it.
 */
function languageYear(target: string): number {
  const t = target.trim().toLowerCase()
  if (t === "esnext") return Number.POSITIVE_INFINITY
  if (t === "es6") return 2015
  if (t === "es5") return 5
  if (t === "es3") return 3
  const year = /^es(\d{4})$/.exec(t)
  assert.ok(year, `unrecognised tsconfig target ${target}`)
  return Number(year[1])
}

test("frontend tsconfig sets an ES2015+ target so iterator spreads typecheck", () => {
  const raw = readFileSync(join(process.cwd(), "tsconfig.json"), "utf8")
  const config = JSON.parse(raw) as {
    compilerOptions?: { target?: string }
  }
  const target = config.compilerOptions?.target
  assert.equal(typeof target, "string", "compilerOptions.target must be set; tsc defaults to ES5")
  assert.ok(
    languageYear(target as string) >= 2015,
    `compilerOptions.target must be ES2015 or higher (got ${target})`,
  )
})
