/**
 * The pre-flight's non-negotiables, asserted against the source.
 *
 * Each of these is a rule the surface exists to enforce rather than a
 * preference, and each one has a specific failure it prevents. A rule that
 * only lives in a review comment is a rule that comes back.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const gate = read("components/preflight/preflight-gate.tsx")
const canvas = read("components/preflight/screen-canvas.tsx")
const plate = read("components/preflight/plate.tsx")
const heard = read("components/preflight/heard-row.tsx")
const conflict = read("components/preflight/conflict-plate.tsx")
const pads = read("components/preflight/canvas-pads.tsx")
const sheet = read("components/preflight/market-sheet.tsx")
const useOrder = read("lib/preflight/use-order.ts")
const search = read("lib/hooks/use-myro-search.tsx")

test("one page-level entry mounts the gate, and holds no domain logic", () => {
  assert.match(search, /<PreflightGate/)
  for (const term of ["deal_breakers", "wont_take", "OrderLine", "briefFrom"]) {
    assert.doesNotMatch(search, new RegExp(term), `useMyroSearch should not know about ${term}`)
  }
})

test("both surfaces read and write ONE order through one query key", () => {
  assert.match(useOrder, /order: \(\) => \["preflight", "order"\]/)
  for (const [name, src] of [["gate", gate], ["sheet", sheet]] as const) {
    assert.match(src, /useOrder\(/, `${name} reads the shared order`)
    assert.match(src, /useOrderMutations\(/, `${name} mutates through the shared hook`)
  }
})

test("every mutation writes the server's answer back into the cache", () => {
  const direct = (useOrder.match(/onSuccess: \(next\) => mergeState\(client, next\)/g) ?? []).length
  const sequenced = (useOrder.match(/onSuccess: \(next, vars\) => mergeIfNewest\(vars\.seq, next\)/g) ?? []).length
  assert.equal(direct, 4, `expected 4 direct merges; found ${direct}`)
  assert.equal(sequenced, 2, `expected 2 sequenced merges; found ${sequenced}`)
})

test("the rail is the attribution — no chip fabricates it, no plate omits it", () => {
  // The vermilion left rail on `.pf-plate[data-said="user"]` is the whole
  // attribution system. A rail without provenance would tell the user they
  // said something Myro heard; provenance without a rail is what we replaced.
  assert.match(plate, /USER_SOURCES: readonly LineSource\[\] = \["user_said", "user_reworded"\]/)
  assert.match(plate, /data-said=\{said\}/)
  const css = read("components/preflight/plate.css")
  assert.match(css, /\.pf-plate\[data-said="user"\]::before/)
  assert.match(css, /background: var\(--tm-interactive\)/)
})

test("a line Myro cannot run is never offered a yes", () => {
  // A yes on an unusable line is a promise the matcher silently ignores.
  assert.match(heard, /disableYes\?: boolean/)
  assert.match(heard, /disableYes \? null :/)
  assert.match(canvas, /disableYes=\{line\.unusable\}/)
})

test("the semantic pair is filled on both sides — no dashed half-answer", () => {
  const css = read("components/preflight/plate.css")
  // Vermilion accept, crimson decline, both filled fills. A dashed outline for
  // "no" reads as "still deciding" for the side that already answered.
  assert.match(css, /\.pf-heard-btn\[data-picked="yes"\][\s\S]{0,200}background: var\(--tm-interactive\)/)
  assert.match(css, /\.pf-heard-btn\[data-picked="no"\][\s\S]{0,200}background: var\(--tm-danger\)/)
})

test("the button label is the action, not the shortcut", () => {
  // "save · enter" is two labels fused. Either the word or the glyph — never
  // both — because a primary button already IS the Enter target.
  assert.doesNotMatch(plate, /save · enter/i)
  assert.doesNotMatch(pads, /save · enter/i)
})

test("editing a guess promotes it, and the shell tells the server", () => {
  // A Myro-inferred plate the user rewords becomes theirs. The optimistic
  // patch already flips source to `user_reworded`; the server is the source
  // of truth on the next fetch.
  assert.match(useOrder, /source: "user_reworded"/)
  assert.match(plate, /onReword: \(text: string\) => void/)
})

test("a proposal accepted here writes on click — no batch commit", () => {
  // The old shell held answers and applied them all at once, which is where
  // 422s from an over-capped effects array came from. Each yes is its own
  // apply now, so the server dedupes and any failure is per-proposal.
  assert.match(gate, /const answerProposal = useCallback\(async \(id: string, verdict: Verdict\)/)
  assert.match(gate, /apply\.mutateAsync\(\{ effects: proposal\.effects, origin: "preflight" \}\)/)
})

test("a failed apply keeps the server's reason and rewinds the pick", () => {
  const body = gate.slice(gate.indexOf("const answerProposal"), gate.indexOf("// ── run"))
  assert.match(body, /applyErrorMessage\(err\)/)
  assert.match(body, /invalidateOrder\(client\)/)
  assert.match(body, /setProposalAnswers\(\(prev\) => \(\{ \.\.\.prev, \[id\]: null \}\)\)/)
})

test("waiting is drawn, never narrated", () => {
  const typing = read("components/preflight/typing.tsx")
  assert.match(sheet, /<MyroTyping/, "sheet still draws the wait")
  assert.doesNotMatch(sheet, /is reading that|thinking…/, "sheet must not narrate the wait")
  assert.match(typing, /role="status"/)
  assert.match(typing, /aria-label=\{label\}/)
})

test("conflicts land as an inline plate, not a modal-in-modal", () => {
  assert.match(canvas, /<ConflictPlate/)
  assert.match(conflict, /className="pf-plate"/)
  assert.match(conflict, /data-kind="conflict"/)
  const logic = read("lib/preflight/conflicts.ts")
  assert.match(logic, /These can't both be true/)
  assert.match(gate, /visibleConflicts\(order\)\.length > 0/)
})

test("Run is single-flight — the button cannot queue a second charge", () => {
  assert.match(gate, /if \(!token \|\| starting\) return/)
  assert.match(gate, /setStarting\(true\)/)
})

test("a failed run never claims nothing was charged", () => {
  assert.doesNotMatch(gate, /Nothing was charged/)
})

test("the run is given a write's timeout, not a read's", () => {
  const api = read("lib/api.ts")
  const run = api.slice(api.indexOf('run: (token: string) =>'))
  assert.match(run.slice(0, 400), /timeoutMs: 45_000/)
})

test("an answer paints immediately and is never rolled back to a stale snapshot", () => {
  const hook = read("lib/preflight/use-order.ts")
  assert.match(hook, /const answerLine = \([\s\S]{0,120}patchLine\(client, lineId, \{ status \}\)/)
  assert.match(hook, /scope: LINE_SCOPE/)
  assert.match(hook, /onError: \(\) => rereadTruth\(client\)/)
  assert.doesNotMatch(hook, /setQueryData\(preflightKeys\.order\(\), ctx\.prev\)/)
  assert.match(hook, /if \(seq < landed\.current\) return/)
})

test("the CV chip goes to the workspace, not a storage URL", () => {
  assert.match(canvas, /href="\/cv"/)
  const code = canvas.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.doesNotMatch(code, /cvHref|cv_url/)
})

test("the RUN screen is the Job Refresh lifecycle, not a four-step play", () => {
  const running = read("components/preflight/screen-running.tsx").replace(/\/\*[\s\S]*?\*\//g, "")
  const hook = read("lib/hooks/use-job-refresh.ts").replace(/\/\*[\s\S]*?\*\//g, "")
  assert.doesNotMatch(running, /Reading your signed-off order/)
  assert.doesNotMatch(running, /stepFromLabel/)
  assert.doesNotMatch(running, /Scoring against your CV baseline/)
  assert.doesNotMatch(hook, /Reading your signed-off order/)
  assert.match(hook, /refreshIsLive/)
  assert.match(hook, /"queued"/)
  assert.match(gate, /lifecycle=\{refreshVm\.state === "computing" \? "computing" : "queued"\}/)
})

test("signing off does not dispatch a second run", () => {
  assert.match(gate, /refreshVm\.attach\(result\)/)
  assert.doesNotMatch(gate, /refreshVm\.refresh\(\)/)
})

test("the market sheet still shares the same order + prose module", () => {
  assert.match(sheet, /Your order · saved in pre-flight/)
  assert.match(sheet, /orderSummaryFrom\(order\)/)
  assert.match(sheet, /from "@\/lib\/preflight\/prose"/)
})

test("no surface hardcodes the handoff's hex — tokens carry both themes", () => {
  const css = [
    read("components/preflight/preflight.css"),
    read("components/preflight/plate.css"),
    read("components/preflight/market-sheet.css"),
  ].join("\n")
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "")
  assert.doesNotMatch(declarations, /#[0-9a-fA-F]{6}\b/, "use design tokens, not hex")
  assert.doesNotMatch(declarations, /rgba\(255, ?76, ?0/, "use --tm-interactive-* glow, not raw orange")
})

test("reduced motion is honoured on every animated surface", () => {
  for (const file of [
    "components/preflight/preflight.css",
    "components/preflight/plate.css",
    "components/preflight/market-sheet.css",
  ]) {
    assert.match(read(file), /prefers-reduced-motion: reduce/, `${file} must honour reduced motion`)
  }
})

test("every Myro utterance pad is SayPad, not a one-line input", () => {
  for (const [name, file] of [
    ["opening", "components/preflight/canvas-pads.tsx"],
    ["sheet", "components/preflight/market-sheet.tsx"],
    ["chat", "components/myro/myro-chat.tsx"],
    ["memory", "components/cv/builder/memory-panel.tsx"],
  ] as const) {
    assert.match(read(file), /<SayPad/, `${name} uses SayPad`)
  }
  const pad = read("components/myro/say-pad.tsx")
  assert.match(pad, /<textarea/)
  assert.match(pad, /e\.key === "Enter" && !e\.shiftKey/)
})

test("the run price comes from the server, never a client constant", () => {
  assert.match(canvas, /order\.run_cost \?\? 0/)
  assert.doesNotMatch(gate, /MYRO_COINS_POLICY|matchRefreshCost/)
  assert.doesNotMatch(canvas, /MYRO_COINS_POLICY|matchRefreshCost/)
})
