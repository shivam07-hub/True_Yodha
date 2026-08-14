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

// Every terminal upload outcome is written down before it is thrown.
//
// The resumable path used to `throw _asUploadFailure(err, "parse")` from the finalize
// catch with no event emitted. A rejected finalize writes no job row either, so the
// whole attempt ended at "put succeeded" — four users reached storage and left no
// trace, one of them on 2026-08-14 with a real 637KB CV we still cannot explain.
test("no CV upload failure path throws without recording the reason", () => {
  const api = read("lib/api.ts")

  const finalizeCatch = api.slice(
    api.indexOf("/cv/upload/finalize"),
    api.indexOf("return _postCVUpload(token, file, idempotencyKey, source)"),
  )
  assert.ok(finalizeCatch.length > 0, "finalize call site still exists")
  assert.match(
    finalizeCatch,
    /_emitCVUploadTelemetry\([\s\S]*?outcome: "failed"[\s\S]*?\)\s*\n\s*throw/,
    "a finalize rejection is recorded before it is thrown",
  )

  // A terminal rejection can also arrive as a 2xx body rather than a throw.
  assert.match(
    api,
    /initial\.status === "failed"[\s\S]{0,400}_emitCVUploadTelemetry/,
    "a 2xx-body rejection is recorded too",
  )

  // The server's own verdict must survive the trip. _asUploadFailure flattens every
  // non-CVUploadFailure to `upload_unknown_error`, which erases the reason.
  assert.match(api, /function _finalizeFailure/, "finalize keeps the server's error code")
})

// A gate nobody counts cannot be told from a gate rejecting real CVs.
test("a refused CV pick is recorded wherever the app refuses one", () => {
  assert.match(read("lib/api.ts"), /export function recordCVUploadPickRejected/)
  assert.match(read("components/cv/cv-upload-step.tsx"), /onReject\?\.\(/)
  assert.match(read("app/(authed)/cv/page.tsx"), /recordCVUploadPickRejected/)
  assert.match(read("app/onboarding/page.tsx"), /recordCVUploadPickRejected/)
})
