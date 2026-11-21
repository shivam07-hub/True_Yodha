import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

// The first drawing (2026-11-02) had no browser in it and never said Chrome or
// extension, so nobody read it as the extension. The browser parts and the
// word Chrome are the contract now.
test("the extension promo is a browser doing the save, and the store link names Chrome", () => {
  const promo = read("../components/extension/extension-promo.tsx")
  const card = read("../components/mission-control/peek-surfaces.tsx")
  const door = read("../components/onboarding/job-choice.tsx")
  const doorCss = read("../components/onboarding/job-choice.css")

  assert.match(promo, /className="ext-tab"/)
  assert.match(promo, /className="ext-url"/)
  assert.match(promo, /className="ext-toolbar-icon"/)
  assert.match(promo, /Save this job/)
  assert.match(promo, /EXTENSION_WEBSTORE_URL/)
  assert.match(promo, /Add to Chrome/)
  assert.match(promo, /nativeButton=\{false\}/)
  assert.match(promo, /aria-hidden/)
  assert.match(promo, /pictureOnly\?: boolean/)
  assert.match(promo, /!pictureOnly &&/)
  assert.match(card, /<ExtensionPromo \/>/)
  assert.match(door, /mode === "extension" && \([\s\S]*<ExtensionPromo pictureOnly \/>/)
  assert.match(door, /Save a job in the extension\. This page continues when it arrives\./)
  assert.match(door, /EXTENSION_WEBSTORE_URL/)
  assert.match(doorCss, /\.tm-job-choice-extension[\s\S]*max-width: 767px[\s\S]*display: none/)
})

test("Add a job leads with the link and offers the extension last, by name", () => {
  const dialog = read("../components/job-import/job-import-dialog.tsx")
  const row = read("../components/extension/extension-row.tsx")

  assert.doesNotMatch(dialog, /ExtensionPromo/)
  assert.match(dialog, /aria-label="Job posting link"[\s\S]*Paste the description instead[\s\S]*<ExtensionRow \/>/)
  assert.match(row, /Chrome extension/)
  assert.match(row, /EXTENSION_WEBSTORE_URL/)
  assert.match(row, /target="_blank"/)
})
