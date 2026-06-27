import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()

function read(path: string) {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("login modal avoids explanatory saved-work subtitles", () => {
  const source = read("components/auth/signup-modal.tsx")

  assert.doesNotMatch(source, /Pick up where you left off/)
  assert.doesNotMatch(source, /CV versions, scores, and saved jobs/)
  assert.doesNotMatch(source, /Right where you left it/)
})
