import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = join(__dirname, "..")

function read(relativePath) {
  return readFileSync(join(frontendRoot, relativePath), "utf8")
}

function collectFiles(startPath, suffix) {
  const found = []
  for (const entry of readdirSync(startPath)) {
    const fullPath = join(startPath, entry)
    if (statSync(fullPath).isDirectory()) {
      found.push(...collectFiles(fullPath, suffix))
      continue
    }
    if (fullPath.endsWith(suffix)) found.push(fullPath)
  }
  return found
}

test("api client uses session adapter and not direct localStorage access", () => {
  const source = read("lib/api.ts")
  assert.match(source, /from "\.\/session"/)
  assert.equal(source.includes("localStorage."), false)
})

test("use-auth hook relies on session adapter", () => {
  const source = read("lib/hooks/use-auth.ts")
  assert.match(source, /from "@\/lib\/session"/)
  assert.equal(source.includes("localStorage."), false)
})

test("auth entry points write tokens through session adapter", () => {
  const loginPage = read("app/login/page.tsx")
  const authForm = read("components/auth/auth-form.tsx")
  const callbackPage = read("app/auth/callback/page.tsx")

  assert.match(loginPage, /setSessionTokens/)
  assert.match(authForm, /setSessionTokens/)
  assert.match(callbackPage, /setSessionTokens/)
  assert.equal(loginPage.includes("localStorage."), false)
  assert.equal(authForm.includes("localStorage."), false)
  assert.equal(callbackPage.includes("localStorage."), false)
})

test("react-query keys use shared dataKeys seam in app surfaces", () => {
  const roots = [join(frontendRoot, "app"), join(frontendRoot, "components")]
  const files = roots.flatMap((root) => collectFiles(root, ".tsx"))
  const literalKeyPattern = /queryKey:\s*\[|invalidateQueries\(\{\s*queryKey:\s*\[/

  for (const filePath of files) {
    const source = readFileSync(filePath, "utf8")
    assert.equal(
      literalKeyPattern.test(source),
      false,
      `raw queryKey array literal found in ${filePath.replace(`${frontendRoot}/`, "")}`,
    )
  }
})
