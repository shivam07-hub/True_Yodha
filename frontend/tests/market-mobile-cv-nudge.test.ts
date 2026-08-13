import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

const page = fs.readFileSync(
  path.join(process.cwd(), "app/(authed)/market/page.tsx"),
  "utf8",
)

test("mobile market reuses the canonical CV nudge without a loading flash", () => {
  assert.match(page, /import \{ CVRequiredNudge \}/)
  assert.match(page, /hasCv=\{profileData === undefined \|\| !!profileData\.has_cv\}/)
  assert.match(page, /feature="best-fit ranking"/)
})
