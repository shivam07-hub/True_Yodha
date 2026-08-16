import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const pageSource = readFileSync(
  new URL("../app/(authed)/cv/page.tsx", import.meta.url),
  "utf8",
)
const hookSource = readFileSync(
  new URL("../lib/hooks/use-cv-playground.ts", import.meta.url),
  "utf8",
)

test("CV display is a versions read, with recovery when that read fails", () => {
  assert.match(hookSource, /cv\.versions\.list/)
  assert.doesNotMatch(hookSource, /cv\.structured/)
  assert.match(pageSource, /playground\.versionsError/)
  assert.match(pageSource, /playground\.refetchVersions/)
  assert.match(pageSource, /<CvStructuredRecovery/)
  assert.doesNotMatch(
    pageSource,
    /\(view === "master-edit" \|\| \(view === "playground" && jobId\)\) && !cvData/,
  )
})

test("a missing layout JSON asks the user to act, never to wait on a sentence", () => {
  const library = readFileSync(
    new URL("../components/cv/builder/library-view.tsx", import.meta.url),
    "utf8",
  )
  const master = readFileSync(
    new URL("../components/cv/builder/master-workspace.tsx", import.meta.url),
    "utf8",
  )
  const mobileEditor = readFileSync(
    new URL("../components/cv/mobile/mobile-main-editor.tsx", import.meta.url),
    "utf8",
  )
  const brain = readFileSync(
    new URL("../lib/hooks/use-match-brain.ts", import.meta.url),
    "utf8",
  )
  assert.match(library, /Add points/)
  assert.doesNotMatch(master, /Loading your CV/)
  assert.doesNotMatch(mobileEditor, /Loading your CV/)
  assert.match(brain, /jobs\.ensureBrain/)
  assert.match(brain, /refetchInterval/)
})
