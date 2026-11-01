import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

test("the extension promo shows the save, and the store link is the only control", () => {
  const promo = read("../components/extension/extension-promo.tsx")
  const card = read("../components/mission-control/peek-surfaces.tsx")
  const dialog = read("../components/job-import/job-import-dialog.tsx")
  const door = read("../components/onboarding/job-choice.tsx")
  const doorCss = read("../components/onboarding/job-choice.css")

  assert.match(promo, /Company page/)
  assert.match(promo, /Save this job/)
  assert.match(promo, /EXTENSION_WEBSTORE_URL/)
  assert.match(promo, /Add jobs as you browse/)
  assert.match(promo, /aria-hidden/)
  assert.match(promo, /pictureOnly\?: boolean/)
  assert.match(promo, /!pictureOnly &&/)
  assert.match(card, /<ExtensionPromo \/>/)
  assert.match(dialog, /<ExtensionPromo \/>/)
  assert.match(door, /mode === "extension" && \([\s\S]*<ExtensionPromo pictureOnly \/>/)
  assert.match(door, /Save a job in the extension\. This page continues when it arrives\./)
  assert.match(door, /EXTENSION_WEBSTORE_URL/)
  assert.match(doorCss, /\.tm-job-choice-extension[\s\S]*max-width: 767px[\s\S]*display: none/)
})
