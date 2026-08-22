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
const say = read("components/preflight/say-band.tsx")
const useOrder = read("lib/preflight/use-order.ts")
const search = read("lib/hooks/use-myro-search.tsx")

test("one page-level entry mounts the gate, and holds no domain logic", () => {
  assert.match(search, /<PreflightGate/)
  for (const term of ["deal_breakers", "wont_take", "OrderLine", "briefFrom"]) {
    assert.doesNotMatch(search, new RegExp(term), `useMyroSearch should not know about ${term}`)
  }
})

test("ONE door — the complaint is a landing inside Myro Search, not a rival to it", () => {
  // /market carried two buttons side by side: "Not it? Tell Myro →" opened a
  // bottom sheet, "Myro Search" opened this modal. Both called
  // `/preflight/proposals`, both wrote the same order, both ran on the same
  // engine — and the sheet priced its own apply from a client constant
  // ("Apply & re-run · 150") while a run costs MATCH_RUN_COST.
  const store = read("store/refreshGateStore.ts")
  assert.match(store, /intent: GateIntent/)
  assert.match(gate, /sayFirst=\{intent === "say"\}/)
  assert.match(search, /openRefreshGate\("review"\)/)
  assert.match(search, /openRefreshGate\("say"\)/)

  for (const [name, file] of [
    ["desktop feed", "components/market/jobs-tab.tsx"],
    ["mobile feed", "mobile/redesign/jobs-surface.tsx"],
  ] as const) {
    const src = read(file)
    assert.doesNotMatch(src, /MarketSheet/, `${name} must not mount a second surface`)
    assert.equal(
      (src.match(/openRefreshGate\("review"\)|run=|runMyroSearch/g) ?? []).length > 0,
      true,
      `${name} still offers the run`,
    )
  }

  // And the order is still ONE record behind one query key.
  assert.match(useOrder, /order: \(\) => \["preflight", "order"\]/)
  assert.match(gate, /useOrder\(/)
  assert.match(gate, /useOrderMutations\(/)
})

test("the say band carries the chips the sheet was worth keeping", () => {
  // A user who knows the feed is wrong usually cannot name why on a blank
  // line. "the pay" is a whole sentence they did not have to write — and it
  // submits the SENTENCE, so the canvas heading shows their own words.
  for (const topic of ["the work", "the place", "the level", "the pay"]) {
    assert.ok(say.includes(`"${topic}"`), `${topic} chip is missing`)
  }
  assert.match(say, /said: "/, "a chip submits a sentence, not its label")
  assert.match(canvas, /<SayBand focused=\{sayFirst\}/)
  // Narrowing is free — the gate re-reads the feed without charging a run,
  // which only the sheet used to do.
  assert.match(gate, /invalidateTargetRoleData\(client\)/)
})

test("every mutation writes the server's answer back into the cache", () => {
  const direct = (useOrder.match(/onSuccess: \(next\) => mergeState\(client, next\)/g) ?? []).length
  const sequenced = (useOrder.match(/onSuccess: \(next, vars\) => mergeIfNewest\(vars\.seq, next\)/g) ?? []).length
  assert.equal(direct, 4, `expected 4 direct merges; found ${direct}`)
  assert.equal(sequenced, 2, `expected 2 sequenced merges; found ${sequenced}`)
})

test("the rail is the attribution — no chip fabricates it, no plate omits it", () => {
  // The accent left rail on `.pf-plate[data-said="user"]` is the whole
  // attribution system. A rail without provenance would tell the user they
  // said something Myro heard; provenance without a rail is what we replaced.
  assert.match(plate, /USER_SOURCES: readonly LineSource\[\] = \["user_said", "user_reworded"\]/)
  assert.match(plate, /data-said=\{said\}/)
  const css = read("components/preflight/plate.css")
  assert.match(css, /\.pf-plate\[data-said="user"\]::before/)
  assert.match(css, /background: var\(--pf-accent\)/)
})

/* ── regressions from the 2026-08-19 authed session ─────────────────────────
 * Seven failures shipped at once. Each assertion below is one of them. */

test("no plate wears a kind eyebrow", () => {
  // LOCATION · WON'T TAKE · DRAWN TO stacked above twenty statements made the
  // loudest text on every row the one the sentence already says. The rail
  // carries provenance; the statement carries its own meaning.
  assert.doesNotMatch(plate, /KIND_EYEBROW/)
  assert.doesNotMatch(canvas, /KIND_EYEBROW/)
  assert.doesNotMatch(read("components/preflight/plate.css"), /\.pf-plate-eyebrow/)
})

test("the meta line earns its place or is absent", () => {
  // "you set this" under a railed plate restates the rail. Only soft and
  // unusable say something the rail cannot.
  assert.match(plate, /line\.unusable[\s\S]{0,120}line\.soft/)
  assert.match(plate, /\{meta \? <div className="pf-plate-meta"/)
})

test("the rail's meaning survives without sight", () => {
  // A 2.5px colour bar is invisible to a screen reader, so the source it
  // encodes travels in the accessible name too.
  assert.match(plate, /aria-label=\{`\$\{line\.text\} — \$\{SOURCE_LABEL\[line\.source\]\}`\}/)
})

test("the canvas renders the resolver's partition, it does not compute one", () => {
  // Two resolvers disagreed in the only direction that matters: the server
  // deduped before filing and the client did not, so one statement rendered
  // twice — once as a settled plate, once inside the conflict holding its twin
  // — and the header counted both (`Won't take · 15 of 6`).
  assert.match(canvas, /order\.slots \?\? \[\]/)
  // The canvas imports the WORDS and nothing else out of `slots.ts`; filing a
  // line into a slot, and how many a slot takes, are the resolver's.
  assert.match(canvas, /import \{ SLOT_COPY \} from "@\/lib\/preflight\/slots"/)
  assert.match(canvas, /arity=\{group\.slot\.arity\}/)
  assert.match(canvas, /filled=\{group\.filled\}/)
  // The one thing done to the server's ids: hide a line the user just dropped,
  // on the tap rather than on the response.
  assert.match(canvas, /line\.status === "kept" \? \[line\] : \[\]/)
})

test("the run bar never claims a count the screen contradicts", () => {
  // `order.used` is 0 whenever a slot is over-arity (payload.py skips the
  // whole group), so the contract sentence read "Myro runs on the 0 lines
  // above" beneath twenty plates. While anything is contested the bar states
  // the block instead.
  assert.match(canvas, /conflicts\.length > 0\s*\?\s*blockedLine\(conflicts\.length\)/)
  const prose = read("lib/preflight/prose.ts")
  assert.match(prose, /export function blockedLine/)
})

test("the run bar refuses an order with nothing to search for", () => {
  // "The work" is not one of six equal slots — every other slot narrows a
  // search, this one is the search. `resolve` omits an empty slot from the
  // spec and the profile write is a PATCH, so a roleless run dispatched
  // against stored titles the modal never showed.
  assert.match(canvas, /const hasRole = useMemo\(/)
  assert.match(canvas, /blocked=\{conflicts\.length > 0 \|\| !hasRole\}/)
  assert.match(canvas, /missingRoleLine\(\)/)
  assert.match(read("lib/preflight/prose.ts"), /export function missingRoleLine/)
})

test("a conflict asks in one line per option, and says when it is done", () => {
  // Nine two-line cards each carrying three uppercase meta fields is a wall,
  // not a question — and it never said how many more had to go.
  assert.match(conflict, /overflowCount\(conflict, options\.length\)/)
  assert.match(conflict, /drop \{over\} more/)
  // Provenance is the same rail, not a meta stack.
  assert.match(conflict, /data-said=\{said\}/)
  assert.doesNotMatch(conflict, /formatRelativeAge/)
})

test("the modal is never a titled empty box while the order loads", () => {
  // /preflight/order is ~8s cold. The shell rendered its chrome over nothing
  // for all of it.
  assert.match(gate, /mode === "canvas" && !order \? <CanvasSkeleton \/> : null/)
  assert.match(read("components/preflight/plate.css"), /\.pf-skeleton-plate/)
})

test("the surface palette is declared once, and covers both themes", () => {
  // Glass needs contrast the global tokens do not give here: --tm-surface with
  // a 4.5% white plate is two shades apart and reads as a flat card.
  const shell = read("components/preflight/preflight.css")
  assert.match(shell, /\.pf-modal \{[\s\S]{0,600}--pf-ground:/)
  assert.match(shell, /:root\[data-surface="light"\] \.pf-modal \{[\s\S]{0,600}--pf-ground:/)
  // All four ingredients of the material, or it is not glass.
  const css = read("components/preflight/plate.css")
  assert.match(css, /\.pf-plate \{[\s\S]{0,400}background: var\(--pf-plate\)/)
  assert.match(css, /\.pf-plate \{[\s\S]{0,400}border: 1px solid var\(--pf-stroke\)/)
  assert.match(css, /\.pf-plate \{[\s\S]{0,400}box-shadow: var\(--pf-inset\), var\(--pf-drop\)/)
})

test("a line Myro cannot run is never offered a yes", () => {
  // A yes on an unusable line is a promise the matcher silently ignores.
  assert.match(heard, /disableYes\?: boolean/)
  assert.match(heard, /disableYes \? null :/)
  assert.match(canvas, /disableYes=\{line\.unusable\}/)
})

test("the semantic pair is filled on both sides — no dashed half-answer", () => {
  const css = read("components/preflight/plate.css")
  // Accent accept, decline crimson, both real fills. A dashed outline for
  // "no" reads as "still deciding" for the side that already answered.
  assert.match(css, /\.pf-heard-btn\[data-picked="yes"\][\s\S]{0,200}background: var\(--pf-accent\)/)
  assert.match(css, /\.pf-heard-btn\[data-picked="no"\][\s\S]{0,200}background: var\(--pf-decline\)/)
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
  assert.doesNotMatch(canvas, /is reading that|thinking…/, "the canvas must not narrate the wait")
  assert.match(typing, /role="status"/)
  assert.match(typing, /aria-label=\{label\}/)
})

test("conflicts land as an inline plate, inside the slot they are about", () => {
  // A conflict IS a statement about one slot's arity, so it belongs beside
  // that slot's plates. Floating every conflict at the bottom of one flat
  // list — which shipped — separated the question from its subject.
  const group = read("components/preflight/slot-group.tsx")
  assert.match(group, /<ConflictPlate/)
  assert.doesNotMatch(canvas, /<ConflictPlate/, "the canvas routes conflicts, it does not render them")
  assert.match(canvas, /clashes\.get\(slot\.key\)/)
  assert.match(conflict, /className="pf-plate"/)
  assert.match(conflict, /data-kind="conflict"/)
  const logic = read("lib/preflight/conflicts.ts")
  assert.match(logic, /These can't both be true/)
  assert.match(gate, /visibleConflicts\(order\)\.length > 0/)
})

/* ── the six-slot spec, as the reader meets it ────────────────────────────── */

test("the canvas is six slots, not one flat column", () => {
  // THE ONE IDEA in MYRO_SEARCH_REBUILD.md: the Order fills a six-slot spec.
  // A flat list of every kept line hides the only structure there is, and
  // cannot answer "what does Myro still need from me?".
  assert.match(canvas, /groups\.map\(\(group\) => \(/)
  assert.match(canvas, /<SlotGroup/)
  const group = read("components/preflight/slot-group.tsx")
  assert.match(group, /<h3 className="pf-slot-label">\{copy\.label\}<\/h3>/)
  // Six groups, in one order, named in one place.
  const slots = read("lib/preflight/slots.ts")
  assert.equal([...slots.matchAll(/label: "/g)].length, 6)
})

test("an empty slot still renders, because the gap is the question", () => {
  // Three headers holding nothing but an invitation say what is missing
  // without a sentence of explanation. A group that vanishes when empty
  // cannot.
  const group = read("components/preflight/slot-group.tsx")
  // No early return on an empty group, and the add chip is unconditional.
  assert.doesNotMatch(group, /if \(!lines\.length\) return null/)
  assert.match(group, /<SlotAdd copy=\{copy\} busy=\{busy\} onAdd=\{onAdd\} \/>/)
})

test("adding into a slot needs no inference and no LLM turn", () => {
  // The user picked the slot by picking which "+" they pressed, so the kind
  // is already known. Routing that through /preflight/proposals would spend
  // an LLM turn re-deriving something the click already said.
  const group = read("components/preflight/slot-group.tsx")
  assert.match(group, /onAdd\(copy\.addKind, text\)/)
  assert.match(gate, /addLine\.mutateAsync\(\{ kind, text, origin: "preflight" \}\)/)
  assert.doesNotMatch(
    gate.slice(gate.indexOf("const addToSlot"), gate.indexOf("// ── run")),
    /preflight\.proposals/,
  )
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

test("literals live in the palette block and nowhere else", () => {
  // The old rule was a blanket hex ban, and it had a hole big enough to lose
  // the design through: every colour came from `--tm-interactive`, which is
  // TEAL in the product's default dark theme and vermilion only under
  // [data-surface="light"]. The rule passed. The modal shipped in the wrong
  // colour, on a flat ground, with no glass — because nothing asserted what
  // the tokens RESOLVED to. Green board, unreadable app.
  //
  // So: one declared palette, scoped to `.pf-modal`, both themes, literals
  // allowed. Everywhere else consumes it and hex is still banned.
  const shell = read("components/preflight/preflight.css")
  const palette = shell.slice(
    shell.indexOf("/* ── the surface palette"),
    shell.indexOf("/* ── shell"),
  )
  assert.ok(palette.length > 200, "the palette block must exist and be findable")

  const consumers = [
    shell.replace(palette, ""),
    read("components/preflight/plate.css"),
  ]
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
  assert.doesNotMatch(consumers, /#[0-9a-fA-F]{6}\b/, "consume the palette, do not restate it")
  assert.doesNotMatch(consumers, /rgba\(255, ?76, ?0/, "use --pf-accent-glow, not raw orange")
})

test("reduced motion is honoured on every animated surface", () => {
  for (const file of [
    "components/preflight/preflight.css",
    "components/preflight/plate.css",
  ]) {
    assert.match(read(file), /prefers-reduced-motion: reduce/, `${file} must honour reduced motion`)
  }
})

test("every Myro utterance pad is SayPad, not a one-line input", () => {
  for (const [name, file] of [
    ["opening", "components/preflight/canvas-pads.tsx"],
    ["say band", "components/preflight/say-band.tsx"],
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
  assert.match(canvas, /price\?\.run_cost \?\? 0/)
  assert.doesNotMatch(gate, /MYRO_COINS_POLICY|matchRefreshCost/)
  assert.doesNotMatch(canvas, /MYRO_COINS_POLICY|matchRefreshCost/)
})

test("the price is its own request, and only the button waits for it", () => {
  // Pricing needs `count_new_jobs_for_user`, a count over `jobs` that
  // read-timed-out at 8s four times in one hour of prod logs. Riding on
  // `GET /preflight/order` it held the plates, the say band and every edit
  // hostage to a number that only decides what the button says — the modal
  // opened in 9.0-10.5s.
  const hooks = read("lib/preflight/use-order.ts")
  assert.match(hooks, /price: \(\) => \["preflight", "price"\]/)
  assert.match(hooks, /export function usePreflightPrice/)
  assert.match(gate, /usePreflightPrice\(token, open\)/)

  // The order render path must not reference the price at all.
  const types = read("lib/preflight/types.ts")
  const orderShape = types.slice(types.indexOf("export interface Order extends OrderState"))
  assert.doesNotMatch(orderShape.slice(0, 200), /run_cost/, "the price is off the order")

  // Run is the ONE control that waits: pressing it unpriced would be
  // consenting to a charge nobody has been shown.
  assert.match(canvas, /priced=\{!!price\}/)
  assert.match(canvas, /disabled=\{busy \|\| blocked \|\| short \|\| !priced\}/)
  // …and it shows no figure until there is one.
  assert.match(canvas, /\? "pricing"/)
})
