import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")
/** Comments describe the design; they are not the code. Strip before asserting
 *  ([[feedback_a_grep_contract_test_trips_on_its_own_prose]]). */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

test("Prep is ONE screen: the rail lists rooms, the main column holds the open one", () => {
  const shell = code("components/preparations/prep-shell.tsx")
  const listPage = code("app/(authed)/preparations/page.tsx")
  const roomPage = code("app/(authed)/preparations/[jobId]/page.tsx")

  // Both routes render the same shell — a second geometry is what drifted before.
  assert.match(listPage, /<PrepShell\b/)
  assert.match(roomPage, /<PrepShell\b/)
  assert.match(roomPage, /jobId=/)

  assert.match(shell, /tm-intel-page prp-workspace-page/)
  assert.match(shell, /className="mc-workspace"/)
  assert.match(shell, /<PrepRail\b/)
  assert.match(shell, /<PrepRoom\b/)
  assert.ok(shell.indexOf("PrepRail") < shell.indexOf('className="mc-ws-main"'))

  // One ladder read feeds both columns, so the pips and the ring cannot disagree.
  assert.match(shell, /dataKeys\.prepLadder\(\)/)
  assert.equal(shell.match(/preparations\.ladder\(/g)?.length, 1)
})

test("The rail carries the head, the pips, then training above skill path and audit", () => {
  const rail = code("components/preparations/prep-rail.tsx")

  assert.match(rail, /className="mc-ws-rail prp-rail"/)
  assert.match(rail, /prp-legend-label/)
  assert.match(rail, /prp-lroom-pips/)
  assert.match(rail, /STEP_LABELS/)

  // Order locked with Shivam 2026-09-06: training sits ABOVE skill path and
  // audit, which the 2b rail does not draw at all but which we keep.
  const train = rail.indexOf("<TrainingCard")
  const skill = rail.indexOf("<SkillPathRail")
  const audit = rail.indexOf("<AuditCard")
  assert.ok(train > 0 && skill > train && audit > skill, "rail order changed")
})

test("The Finlatics block shows three matched programmes, never the catalogue", () => {
  const train = code("components/preparations/training-card.tsx")
  const trainCss = read("components/preparations/training-card.css")

  assert.match(train, /FINLATICS_BRAND_LABEL/)
  assert.match(train, /FINLATICS_APPLY_LABEL/)
  // The `why` is the whole reason this block is not an ad.
  assert.match(train, /\bwhy\b/)
  assert.match(train, /matched/)
  // The disclosure is gone: the blurb is on the card.
  assert.doesNotMatch(train, /prp-course-toggle/)
  assert.doesNotMatch(trainCss, /\.prp-course-panel/)
  // Only the matched card spends accent.
  assert.match(trainCss, /\.prp-course\.is-matched/)
  assert.match(trainCss, /\.prp-train \{[\s\S]*?margin-top:\s*auto/)
})

test("Skeleton matches the live workspace so the swap does not move the page", () => {
  const skel = code("components/preparations/prep-skeleton.tsx")

  assert.match(skel, /tm-intel-page prp-workspace-page/)
  assert.match(skel, /className="mc-workspace"/)
  assert.match(skel, /className="prp-lroom"/)
  assert.match(skel, /className="prp-stand prp-train"/)
  assert.match(skel, /prp-legend-label/)
  assert.doesNotMatch(skel, /Loading your rooms/)
  assert.ok(skel.indexOf("mc-ws-rail") < skel.indexOf("mc-ws-main"))

  // The room route loads the SAME shape — no second geometry to drift.
  assert.match(skel, /export const PrepRoomSkeleton = PrepSkeleton/)

  const bootstrap = code("components/loading/page-skeletons.tsx")
  assert.match(bootstrap, /pathname\.startsWith\("\/preparations"\)/)
  assert.match(bootstrap, /PrepSkeleton/)
})

test("The room renders the four steps, and every pip reads the same data-state", () => {
  const room = code("components/preparations/prep-room.tsx")
  const rail = code("components/preparations/prep-rail.tsx")
  const step = code("components/preparations/step-card.tsx")
  const css = read("components/preparations/preparations.css")

  assert.match(room, /<StepCard\b/)
  assert.match(room, /STEP_LABELS\.map/)
  assert.match(room, /prp-band-pip/)
  assert.match(room, /strokeDasharray/)
  assert.match(step, /data-state=\{value\}/)

  // The rail pip, the band pip and the step number all key off data-state.
  assert.match(css, /\.prp-lroom-pips > span\[data-state="2"\]/)
  assert.match(css, /\.prp-step-n\[data-state="2"\]/)
  // 2b's rail is a FIXED 360px against a fluid room. A fractional rail took
  // ~550px at 1456 and stretched the legend, the room rows and the pips it is
  // supposed to key — the drift this test now pins shut.
  assert.match(css, /grid-template-columns:\s*360px\s*minmax\(0,\s*1fr\)/)

  // Switching rooms is a STATE change. Both routes render one component off one
  // cached read, so a route change bought nothing and cost an RSC round trip
  // behind a loading.tsx whose skeleton is the whole page — the rail tore
  // itself down on every click. Deep links keep working: the href stays.
  const shell = code("components/preparations/prep-shell.tsx")
  assert.match(rail, /event\.preventDefault\(\)/)
  assert.match(rail, /onOpen\(app\.job_id, href\)/)
  assert.match(shell, /window\.history\.pushState/)
  assert.match(shell, /popstate/)

  // The list page's stage-grouped index is gone, and so are its styles.
  assert.doesNotMatch(css, /\.prp-group-head/)
  assert.doesNotMatch(css, /\.prp-row \{/)
})

test("Every part of the surface comes from an analysis and offers a decision", () => {
  const room = code("components/preparations/prep-room.tsx")
  const rail = code("components/preparations/prep-rail.tsx")
  const reh = code("components/preparations/rehearse-panel.tsx")
  const step = code("components/preparations/step-card.tsx")
  const brief = code("components/preparations/brief-card.tsx")

  // Step 3 RECORDS, and it records against the STORY — the person, not the
  // job. Keying it to this room's requirement strings is what made the rail's
  // own headline false: the same story rehearsed in seven rooms started from
  // zero seven times.
  assert.match(reh, /setRehearsal\(/)
  assert.match(reh, /aria-pressed=\{marked\}/)
  assert.match(reh, /storyId/)
  assert.doesNotMatch(reh, /rehearsed:\s*string\[\]/)
  // A requirement with no story has nothing to say yet — the server refuses
  // it, so the control must not be there at all.
  assert.match(reh, /storyId \? \(/)
  // The carry is invisible from inside one room; one sentence names it.
  assert.match(reh, /counts in every room/)
  // The rail pip and the ring read the ladder, not this panel — without the
  // invalidate they keep the old step until a reload.
  assert.match(reh, /invalidateQueries\(\{ queryKey: dataKeys\.prepLadder\(\) \}\)/)

  // The cross-room line states a bottleneck; it must offer somewhere to go.
  assert.match(room, /prp-across-go/)
  assert.match(room, /\?step=\$\{totals\.bottleneck_step\}/)
  assert.match(room, /furthestBehind|behind/)

  // A closed room has no ladder — it must not render as 0% with four empty pips.
  assert.match(rail, /is-closed/)
  assert.match(rail, /closed \? null :/)

  // Step 4 claimed a gate nothing enforces. BriefCard still sells the brief.
  assert.doesNotMatch(step, /opens at step 3/)
  assert.match(step, /best after step 3/)
  assert.match(brief, /Best after step 3/)
})
