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

test("the dropzone owns the send, never the analysis", () => {
  // The dropzone used to mutate into "Reading your CV…" after the bytes left,
  // then /onboarding/result mounted the real wait and said the same thing again.
  // Bytes leaving the device are this surface's only wait. Analysis is
  // CvAnalysisStage. A bar that hid at 100% was the cue that swapped the copy.
  const surface = read("components/cv/cv-upload-step.tsx")
  assert.match(surface, /Sending your CV/)
  assert.doesNotMatch(surface, /Reading your CV/)
  assert.doesNotMatch(surface, /This takes a few seconds/)
  assert.doesNotMatch(surface, /progressPct < 100/)

  const landing = read("components/public/landing/dropzone.tsx")
  assert.match(landing, /Sending your CV/)
  assert.doesNotMatch(landing, /Reading your CV/)
  assert.doesNotMatch(landing, /This takes a few seconds/)
  assert.match(landing, /\{!pending && \(pasteOpen/, "alternate doors hide once the file is handed off")

  const step = read("components/onboarding/experience-step.tsx")
  assert.match(
    step,
    /\{!busy && \([\s\S]*No CV\? Describe your experience/,
    "alternate doors hide the moment a file is committed",
  )
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

// One Myro, whichever screen you're on.
//
// Two chat components existed against one job-intent endpoint. They were not
// duplicates — the pre-flight panel proposes into a draft and never writes, the
// market sheet applies and re-runs the feed — but everything up to the outcome
// was the same twice, which is how one of them ends up warmer than the other and
// the user meets two Myros.
test("every Myro conversation goes through the one seam", () => {
  const api = read("lib/api.ts")
  assert.match(api, /export const mentor = \{/, "there is one client entry")
  assert.match(api, /"\/mentor\/converse"/)

  // Contract half of expand-contract: the pre-flight redesign moved both
  // job_intent callers onto /preflight/proposals, which runs the same mentor
  // server-side, so the deprecated client shim has no callers left and is gone.
  assert.doesNotMatch(api, /intentChat:/, "the deprecated /jobs/intent-chat shim is deleted")
  assert.doesNotMatch(api, /applyIntentDiff:/)
  assert.match(api, /export const preflight = \{/, "job intent goes through the order")

  const panel = read("components/cv/builder/memory-panel.tsx")
  assert.match(panel, /mentor\.converse|MyroChat/, "the CV surface talks to Myro through the seam")
  assert.match(panel, /"cv"/, "the CV surface declares its surface")

  // Job intent reaches the same mentor through the order's propose route —
  // and through exactly ONE surface now. The market bottom-sheet was a second
  // modal against the same order and the same engine; its complaint path is a
  // landing inside Myro Search ("say") rather than a rival door.
  assert.match(
    // The gate's network turns; lifted out of the shell when it crossed 300
    // lines. Same one surface, same one route.
    read("components/preflight/use-order-turns.ts"),
    /preflight\.proposals\(/,
    "Myro Search proposes through the order",
  )
  assert.doesNotMatch(
    read("components/preflight/say-band.tsx"),
    /preflight\./,
    "the say band hands its sentence up, it does not open a second conversation",
  )
})

test("the CV surface listens but never proposes", () => {
  // A diff on the CV screen is a change with no accept path — and targeting that
  // moves without the user meaning it re-ranks a market whose verdicts cache
  // permanently. The server drops it; this keeps the client honest too.
  const panel = read("components/cv/builder/memory-panel.tsx")
  assert.match(panel, /surface="cv"/)
  assert.doesNotMatch(panel, /onPropose/, "the CV surface must not wire a proposal handler")
})
