import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("CV Hub and onboarding share one canonical upload surface", () => {
  const surface = read("components/cv/cv-upload-step.tsx")
  const onboarding = read("components/onboarding/experience-step.tsx")
  const hub = read("app/cv-preview/page.tsx")

  assert.match(surface, /preflightCVUploadFile/, "the canonical surface owns file safety validation")
  assert.match(surface, /Drop your CV here, or choose a file/)
  assert.match(surface, /PDF or DOCX, up to 10 MB/)
  assert.match(onboarding, /CVUploadStep/)
  assert.match(hub, /CVUploadStep/)
  assert.doesNotMatch(hub, /LandingDropzone/)
})

test("anonymous CV Hub keeps its safe pre-signup alternatives", () => {
  const hub = read("app/cv-preview/page.tsx")

  assert.match(hub, /No CV\? Paste your CV text/)
  assert.match(hub, /Browse jobs instead/)
  assert.match(hub, /saved only if you choose to create an account/)
})
