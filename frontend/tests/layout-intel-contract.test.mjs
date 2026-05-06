import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = join(__dirname, "..")

function read(relativePath) {
  return readFileSync(join(frontendRoot, relativePath), "utf8")
}

test("intel section wrapper uses growable height to avoid overlap", () => {
  const source = read("app/page.tsx")
  const intelBlockMatch = source.match(/id="intel"[\s\S]*?<IntelPane \/>/)

  assert.ok(intelBlockMatch, "intel wrapper block should exist in app/page.tsx")

  const intelBlock = intelBlockMatch[0]
  assert.match(intelBlock, /minHeight:\s*"100dvh"/)
  assert.match(intelBlock, /height:\s*"auto"/)
  assert.doesNotMatch(intelBlock, /\bheight:\s*"100dvh"/)
})
