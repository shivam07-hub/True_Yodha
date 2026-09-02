import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

test("dismiss actions use one reversible-negative interaction treatment", () => {
  const button = read("../components/ui/button.tsx")
  const globals = read("../app/globals.css")

  assert.match(button, /dismiss:\s*cn\(/)
  assert.match(button, /dismiss:[\s\S]*?tm-dismiss-action[\s\S]*?danger-wash/)
  assert.match(globals, /\.tm-dismiss-action\.tm-dismiss-action:hover:not\(:disabled\)/)
  assert.match(globals, /\.tm-dismiss-action\.tm-dismiss-action:focus-visible/)
  assert.match(globals, /var\(--tm-danger\)/)

  // Irreversible actions remain visually stronger than reversible dismissal.
  assert.match(button, /danger:[\s\S]*?hover:bg-\[var\(--tm-danger\)\]/)
})

test("canonical job and collection rejection controls opt into dismiss intent", () => {
  const surfaces = [
    "../components/market/job-card.tsx",
    "../components/market/mobile-feed.tsx",
    "../components/dashboard/card-atoms.tsx",
    "../components/collections/collection-rows.tsx",
    "../mobile/redesign/swipe-card.tsx",
    "../mobile/redesign/job-detail-sheet.tsx",
    "../mobile/redesign/collection-card.tsx",
  ]

  for (const surface of surfaces) {
    assert.match(read(surface), /tm-dismiss-action/, `${surface} must use the shared dismiss intent`)
  }
})
