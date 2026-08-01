import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const frontendRoot = process.cwd()
const sourceRoots = ["app", "components", "lib", "mobile"]
const sourceExtensions = [".ts", ".tsx"] as const

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) return sourceFiles(path)
    if (!sourceExtensions.some((ext) => path.endsWith(ext))) return []
    return [path]
  })
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
}

test("user-facing source copy says tokens instead of XP", () => {
  const offenders = sourceRoots
    .flatMap((root) => sourceFiles(join(frontendRoot, root)))
    .flatMap((path) => {
      const cleaned = stripComments(readFileSync(path, "utf8"))
      return cleaned.match(/\bXP\b/) ? [relative(frontendRoot, path)] : []
    })

  assert.deepEqual(offenders, [])
})

test("desktop chrome does not expose the background practice timer or balance pill", () => {
  // `components/shell/web-chrome.tsx` was split in the nav-delegation refactor,
  // so this read ENOENT'd. Scanning the whole chrome directory keeps the
  // assertion true through the next split too — the claim is that NO chrome
  // component mounts these, which a single hardcoded path could never check.
  const chrome = sourceFiles(join(frontendRoot, "components/shell"))
    .concat(sourceFiles(join(frontendRoot, "components/nav")))

  assert.ok(chrome.length > 0, "chrome components should exist to be checked")
  for (const path of chrome) {
    const source = readFileSync(path, "utf8")
    const where = relative(frontendRoot, path)
    assert.doesNotMatch(source, /tm-topbar-forge-chip/, `${where} should not mount the practice timer`)
    assert.doesNotMatch(source, /tm-topbar-xp/, `${where} should not mount the balance pill`)
  }
})
