import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

/**
 * One click from a best job to tailoring, and no blind step in between.
 *
 * Measured 2026-09-28: of 55 people with best jobs, 44 were shown one, 11 saved
 * one and 6 tailored one. The /market card offered only Skip / Save / Share, so
 * tailoring sat behind the job panel, and three steps on the way (the panel, the
 * CV editor opening for the job, the download) left no record, so nobody could
 * say where people stopped.
 *
 * Assertions match the CALL, not the word: the components explain these steps
 * in prose, and a bare-name grep would pass on a comment while the emit was gone.
 */

const card = read("components/market/job-card.tsx")
const column = read("components/market/market-jobs-column.tsx")
const tab = read("components/market/jobs-tab.tsx")
const band = read("components/jobs/agent-picks-band.tsx")
const drawer = read("components/market/job-detail-drawer.tsx")
const playground = read("components/cv/builder/playground-view.tsx")
const landing = read("components/cv/builder/use-tailor-landing.ts")
const swipe = read("mobile/redesign/swipe-card.tsx")
const surface = read("mobile/redesign/jobs-surface.tsx")
const api = read("lib/api.ts")

test("the desktop card carries Tailor CV as its primary action", () => {
  assert.match(card, /className="tm-triage-btn tm-triage-tailor"/)
  assert.match(card, /onTailor\(\)/)
})

test("a feed card saves, then opens the editor for that job", () => {
  assert.match(column, /onTailor=\{\(\) => \{ onSave\(row\.job\); openTailor\(row\.job, "market"\) \}\}/)
  const emit = tab.indexOf('emitLoopStep(token, "card_tailor", j.job_id, surface)')
  const push = tab.indexOf("router.push(`/cv?jobId=${encodeURIComponent(j.job_id)}`)")
  assert.ok(emit > -1 && push > emit, "openTailor must record the step before it navigates")
})

test("an Agent Pick saves through its own triage before tailoring", () => {
  assert.match(band, /onTailor=\{openTailor \? \(\) => \{ triage\.save\(pick\); openTailor\(pick\) \}/)
})

test("the phone card offers the same action, saved first", () => {
  assert.match(swipe, /onTailor\(\) \}\} className="mm-press" style=\{tailorBtn\}>Tailor CV</)
  const save = surface.indexOf('triage(job, "saved")')
  const emit = surface.indexOf('emitLoopStep(token, "card_tailor", job.job_id, "mobile_feed")')
  assert.ok(save > -1 && emit > save, "the phone card must save before it records and navigates")
  assert.match(surface, /onTailor=\{\(\) => tailorFromCard\(entry\.job\)\}/)
})

test("the three blind steps and the Mentor door are recorded", () => {
  assert.match(drawer, /useEffect\(\(\) => \{ emitLoopStep\(token, "panel_opened", job\.job_id, "market"\) \}/)
  assert.match(drawer, /emitLoopStep\(token, "panel_tailor", job\.job_id, "market"\)/)
  assert.match(surface, /emitLoopStep\(token, "panel_opened", jobId, "mobile_feed"\)/)
  assert.match(playground, /useEffect\(\(\) => \{ emitLoopStep\(token, "editor_opened", jobId, "cv"\) \}/)
  const exported = playground.indexOf("await exportSheetPdf(token, el, pdfFilename)")
  const downloaded = playground.indexOf('emitLoopStep(token, "downloaded", jobId, "pdf")')
  assert.ok(exported > -1 && downloaded > exported, "a download is recorded only after the PDF arrived")
  assert.match(landing, /emitLoopStep\(opts\.token, "mentor_opened", opts\.jobId, "cv_header"\)/)
})

test("the step survives the navigation it precedes", () => {
  const fn = api.slice(api.indexOf("export function emitLoopStep"))
  assert.match(fn.slice(0, 700), /keepalive: true/)
})
