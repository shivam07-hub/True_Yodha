/**
 * The logged-out CV playground (/cv-preview) must never mount the `useAuth`
 * gate: the gate sends a visitor with no session to /login. From 2026-09-29 the
 * section-rename hook called it inside the editor, so every logged-out visitor
 * who scored a CV was bounced to /login as the playground opened (no anonymous
 * download was recorded after the week of 09-14).
 *
 * Walks every module the playground imports and lists the ones that call
 * `useAuth()`. Only `SectionTitlesProvider` may, and it mounts in
 * the authed layout alone. A new caller fails here, so it is looked at, not
 * shipped. (The page's public nav imports the signed-in menus too, rendered
 * only with a session, so the walk starts below the chrome.)
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function resolveImport(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2))
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec)
  else return null
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (/\.(ts|tsx)$/.test(candidate) && existsSync(candidate)) return candidate
  }
  return null
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [join(ROOT, entry)]
  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    const src = readFileSync(file, "utf8")
    for (const match of src.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const next = resolveImport(file, match[1] ?? match[2])
      if (next && !seen.has(next)) queue.push(next)
    }
  }
  return seen
}

test("nothing the logged-out playground imports calls the /login gate, but the authed provider", () => {
  const files = new Set([...reachable("components/public/cv-preview/public-playground.tsx")])
  files.delete(join(ROOT, "lib/hooks/use-auth.ts")) // the definition, not a caller
  const callers = [...files]
    .filter((file) => /\buseAuth\(\)/.test(readFileSync(file, "utf8")))
    .map((file) => relative(ROOT, file))
    .sort()
  assert.deepEqual(callers, ["components/cv/section-titles-provider.tsx"])
})

test("the rename hook reads the session and offers renaming only with one", () => {
  const provider = readFileSync(join(ROOT, "components/cv/section-titles-provider.tsx"), "utf8")
  const hook = provider.slice(provider.indexOf("export function useRenameSection"))
  assert.match(hook, /const \{ token \} = useSession\(\)/)
  assert.doesNotMatch(hook, /useAuth\(\)/)
  assert.match(hook, /canRename: !!token/)
  // The one useAuth() left is the provider the authed layout mounts.
  const layout = readFileSync(join(ROOT, "app/(authed)/layout.tsx"), "utf8")
  assert.match(layout, /<SectionTitlesProvider>/)

  const doc = readFileSync(join(ROOT, "components/cv/builder/cv-document.tsx"), "utf8")
  assert.match(doc, /if \(!renamable \|\| !canRename\) return <>\{label\}<\/>/)
})
