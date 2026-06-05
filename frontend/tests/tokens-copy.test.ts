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
  const source = readFileSync(join(frontendRoot, "components/shell/web-chrome.tsx"), "utf8")

  assert.doesNotMatch(source, /tm-topbar-forge-chip/)
  assert.doesNotMatch(source, /tm-topbar-xp/)
})
