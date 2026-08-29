/**
 * The pre-flight's non-negotiables, asserted against the source.
 *
 * Each of these is a rule the surface exists to enforce rather than a
 * preference, and each one has a specific failure it prevents. A rule that
 * only lives in a review comment is a rule that comes back.
 *
 * Re-anchored for the journey rebuild: `screen-canvas.tsx` became
 * `journey.tsx` + the step screens, `plate.tsx` became `chip.tsx`, and
 * `plate.css` split into `chip.css` (the chip), `journey.css` (the step and
 * the pinned footer) and `surface.css` (what more than one screen needs).
 * Every rule below survived the move; only the file it is read from changed.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const gate = read("components/preflight/preflight-gate.tsx")
const journey = read("components/preflight/journey.tsx")
const jfooter = read("components/preflight/journey-footer.tsx")
const derive = read("lib/preflight/derive.ts")
const stepSlot = read("components/preflight/step-slot.tsx")
const signoff = read("components/preflight/step-signoff.tsx")
const open = read("components/preflight/step-open.tsx")
const chrome = read("components/journey/journey-chrome.tsx")
const chromeCss = read("components/journey/journey-chrome.css")
const header = read("components/preflight/preflight-header.tsx")
const chip = read("components/preflight/chip.tsx")
const group = read("components/preflight/chip-group.tsx")
const heard = read("components/preflight/heard-row.tsx")
const conflict = read("components/preflight/conflict-plate.tsx")
const say = read("components/preflight/say-band.tsx")
const useOrder = read("lib/preflight/use-order.ts")
const search = read("lib/hooks/use-myro-search.tsx")

const chipCss = read("components/preflight/chip.css")
const journeyCss = read("components/preflight/journey.css")
const surfaceCss = read("components/preflight/surface.css")
const shellCss = read("components/preflight/preflight.css")

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
  assert.match(gate, /intent=\{intent\}/)
  assert.match(journey, /sayFirst=\{intent === "say"\}/)
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
  // line. "the pay" is a whole topic they did not have to write.
  for (const topic of ["the work", "the place", "the level", "the pay"]) {
    assert.ok(say.includes(`"${topic}"`), `${topic} chip is missing`)
  }
  // It lives on Sign off — below the groups, because they answer "what will
  // Myro search for" and it answers "and if that is wrong?".
  assert.match(signoff, /<SayBand/)

  // A chip is a NAMED TOPIC, answered by `proposals.from_topic` off a table:
  // no LLM turn, no cost, and it can strike the kept line the topic is about.
  assert.match(say, /onTopic\(topic\)/)
  assert.match(gate, /preflight\.proposals\(token, \{ topic \}\)/)
  // …and it must not overwrite `said`: sentence one of the brief is the work
  // the user wants, not the complaint they have about the results.
  const topicTurn = gate.slice(gate.indexOf("const proposeTopic"), gate.indexOf("const answerProposal"))
  assert.doesNotMatch(topicTurn, /setSaid/)
  // Narrowing is free — the gate re-reads the feed without charging a run.
  // Widening brings roles into scope nothing has rated, so re-reading cannot
  // show them; that refetch spends a read to render the same list.
  assert.match(gate, /if \(!proposal\.costly\) invalidateTargetRoleData\(client\)/)
})

test("every mutation writes the server's answer back into the cache", () => {
  const direct = (useOrder.match(/onSuccess: \(next\) => mergeState\(client, next\)/g) ?? []).length
  const sequenced = (useOrder.match(/onSuccess: \(next, vars\) => mergeIfNewest\(vars\.seq, next\)/g) ?? []).length
  assert.equal(direct, 4, `expected 4 direct merges; found ${direct}`)
  assert.equal(sequenced, 2, `expected 2 sequenced merges; found ${sequenced}`)
})

test("the rail is the attribution — no chip fabricates it, none omits it", () => {
  // The accent left rail on `[data-said="user"]` is the whole attribution
  // system. A rail without provenance would tell the user they said something
  // Myro heard; provenance without a rail is what we replaced.
  assert.match(chip, /USER_SOURCES: readonly LineSource\[\] = \["user_said", "user_reworded"\]/)
  assert.match(chip, /data-said=\{said\}/)
  assert.match(chipCss, /\.pf-chip\[data-said="user"\]::before/)
  assert.match(chipCss, /background: var\(--pf-accent\)/)
})

/* ── regressions from the 2026-08-19 authed session ─────────────────────────
 * Seven failures shipped at once. Each assertion below is one of them. */

test("no chip wears a kind eyebrow", () => {
  // LOCATION · WON'T TAKE · DRAWN TO stacked above twenty statements made the
  // loudest text on every row the one the sentence already says. The rail
  // carries provenance; the statement carries its own meaning. The SLOT still
  // has a header — a label above every group is structure, a label above every
  // statement is noise.
  assert.doesNotMatch(chip, /KIND_EYEBROW/)
  assert.doesNotMatch(journey, /KIND_EYEBROW/)
  assert.doesNotMatch(chipCss, /\.pf-chip-eyebrow/)
})

test("the meta line earns its place or is absent", () => {
  // "you set this" under a railed chip restates the rail. Only soft and
  // unusable say something the rail cannot — and a chip carrying one takes a
  // full row, because the note has to stay readable.
  assert.match(chip, /line\.unusable[\s\S]{0,160}line\.soft/)
  assert.match(chip, /data-wide=\{meta \? "true" : undefined\}/)
  assert.match(chipCss, /\.pf-chip\[data-wide="true"\]/)
})

test("the rail's meaning survives without sight", () => {
  // A 2.5px colour bar is invisible to a screen reader, so the source it
  // encodes travels in the accessible name too — and so does softness on the
  // one chip whose visible note is suppressed because its group already says
  // it. Sighted readers get the group label; everyone else gets the words.
  assert.match(chip, /\$\{line\.text\} — \$\{SOURCE_LABEL\[line\.source\]\}/)
  assert.match(chip, /line\.soft && !softNote[\s\S]{0,140}a preference, not a hard line/)
})

test("the journey renders the resolver's partition, it does not compute one", () => {
  // Two resolvers disagreed in the only direction that matters: the server
  // deduped before filing and the client did not, so one statement rendered
  // twice — once as a settled plate, once inside the conflict holding its twin
  // — and the header counted both (`Won't take · 15 of 6`).
  assert.match(derive, /order\.slots \?\? \[\]/)
  // The journey imports the WORDS and nothing else out of `slots.ts`; filing a
  // line into a slot, and how many a slot takes, are the resolver's.
  assert.match(derive, /import \{ SLOT_COPY \} from ".\/slots"/)
  assert.match(derive, /arity: slot\.arity/)
  assert.match(derive, /filled: lines\.length \+ held\.length/)
  // The one thing done to the server's ids: hide a line the user just dropped,
  // on the tap rather than on the response.
  assert.match(derive, /line\.status === "kept" \? \[line\] : \[\]/)
})

test("the footer never claims a count the screen contradicts", () => {
  // `order.used` is 0 whenever a slot is over-arity (payload.py skips the
  // whole group), so the contract sentence read "Myro runs on the 0 lines
  // above" beneath twenty plates. While anything is contested it states the
  // block instead.
  assert.match(jfooter, /conflicts\.length > 0\s*\n?\s*\?\s*blockedLine\(conflicts\.length\)/)
  assert.match(read("lib/preflight/prose.ts"), /export function blockedLine/)
})

test("Run refuses an order with nothing to search for", () => {
  // "The work" is not one of six equal slots — every other slot narrows a
  // search, this one is the search. `resolve` omits an empty slot from the
  // spec and the profile write is a PATCH, so a roleless run dispatched
  // against stored titles the modal never showed.
  assert.match(journey, /const hasRole = order\.lines\.some/)
  assert.match(jfooter, /const blocked = conflicts\.length > 0 \|\| !hasRole/)
  assert.match(jfooter, /missingRoleLine\(\)/)
  assert.match(read("lib/preflight/prose.ts"), /export function missingRoleLine/)
  // …and the step that owns the work slot will not hand the user forward with
  // it empty, so nobody reaches Run only to be told no.
  assert.match(jfooter, /stepKey === "work" && !hasRole/)
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
  assert.match(gate, /mode === "canvas" \? <StepSkeleton \/> : null/)
  assert.match(surfaceCss, /\.pf-skeleton-chip/)
})

test("the surface palette is declared once, and covers both themes", () => {
  // Glass needs contrast the global tokens do not give here: --tm-surface with
  // a 4.5% white plate is two shades apart and reads as a flat card.
  assert.match(shellCss, /\.pf-modal \{[\s\S]{0,600}--pf-ground:/)
  assert.match(shellCss, /:root\[data-surface="light"\] \.pf-modal \{[\s\S]{0,600}--pf-ground:/)
})

test("a line Myro cannot run is never offered a yes", () => {
  // A yes on an unusable line is a promise the matcher silently ignores.
  assert.match(heard, /disableYes\?: boolean/)
  assert.match(heard, /disableYes \? null :/)
  assert.match(stepSlot, /disableYes=\{line\.unusable\}/)
  assert.match(signoff, /disableYes=\{line\.unusable\}/)
})

test("the semantic pair is filled on both sides — no dashed half-answer", () => {
  // Accent accept, decline crimson, both real fills. A dashed outline for
  // "no" reads as "still deciding" for the side that already answered.
  assert.match(surfaceCss, /\.pf-heard-btn\[data-picked="yes"\][\s\S]{0,200}background: var\(--pf-accent\)/)
  assert.match(surfaceCss, /\.pf-heard-btn\[data-picked="no"\][\s\S]{0,200}background: var\(--pf-decline\)/)
})

test("the button label is the action, not the shortcut", () => {
  // "save · enter" is two labels fused. Either the word or the glyph — never
  // both — because a primary button already IS the Enter target.
  for (const [name, src] of [["chip", chip], ["open", open], ["chrome", chrome]] as const) {
    assert.doesNotMatch(src, /save · enter/i, `${name} must not fuse a label and its shortcut`)
  }
})

test("editing a guess promotes it, and the shell tells the server", () => {
  // A Myro-inferred chip the user rewords becomes theirs. The optimistic patch
  // already flips source to `user_reworded`; the server is the source of truth
  // on the next fetch.
  assert.match(useOrder, /source: "user_reworded"/)
  assert.match(chip, /onReword: \(text: string\) => void/)
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
  assert.doesNotMatch(journey, /is reading that|thinking…/, "the journey must not narrate the wait")
  assert.match(typing, /role="status"/)
  assert.match(typing, /aria-label=\{label\}/)
})

test("conflicts land inside the slot they are about", () => {
  // A conflict IS a statement about one slot's arity, so it belongs beside
  // that slot's chips. Floating every conflict at the bottom of one flat list
  // — which shipped — separated the question from its subject.
  assert.match(group, /<ConflictPlate/)
  assert.doesNotMatch(journey, /<ConflictPlate/, "the journey routes conflicts, it does not render them")
  assert.match(derive, /clashes\.get\(slot\.key\)/)
  assert.match(conflict, /className="pf-conflict"/)
  const logic = read("lib/preflight/conflicts.ts")
  assert.match(logic, /These can't both be true/)
  assert.match(gate, /visibleConflicts\(order\)\.length > 0/)
})

/* ── the six-slot spec, as the reader meets it ────────────────────────────── */

test("the order is six slots, never one flat column", () => {
  // THE ONE IDEA in MYRO_SEARCH_REBUILD.md: the Order fills a six-slot spec.
  // A flat list of every kept line hides the only structure there is, and
  // cannot answer "what does Myro still need from me?".
  assert.match(journey, /<ChipGroup|groups=\{/)
  assert.match(group, /<h3 className="pf-group-label">\{copy\.label\}<\/h3>/)
  // Six groups, named in one place.
  const slots = read("lib/preflight/slots.ts")
  assert.equal([...slots.matchAll(/label: "/g)].length, 6)
  // …and every one of them is reachable from exactly one step. A slot no step
  // renders is a slot the user can never fill.
  const steps = read("lib/preflight/journey.ts")
  for (const key of [
    "target_role_titles", "target_locations", "deal_breakers",
    "lean", "career_goal", "superpower",
  ]) {
    assert.ok(steps.includes(`"${key}"`), `${key} belongs to no step`)
  }
})

test("an empty slot still renders, because the gap is the question", () => {
  // A header holding nothing but an invitation says what is missing without a
  // sentence of explanation. A group that vanishes when empty cannot — and the
  // add sits INSIDE the chip row, which is what makes an empty slot one line
  // instead of the 88px band it used to cost.
  assert.doesNotMatch(group, /if \(!lines\.length\) return null/)
  assert.match(group, /<SlotAdd/)
  assert.match(group, /chosen=\{lines\.map/)
  const row = group.indexOf('className="pf-chips"')
  const add = group.indexOf("<SlotAdd", row)
  const rowEnd = group.indexOf("</div>", row)
  assert.ok(add > row && add < rowEnd, "the add is a chip in the row, not a band beneath it")
})

test("adding into a slot needs no inference and no LLM turn", () => {
  // The user picked the slot by picking which "+" they pressed, so the kind
  // is already known. Routing that through /preflight/proposals would spend
  // an LLM turn re-deriving something the click already said.
  assert.match(group, /onAdd\(copy\.addKind, text\)/)
  assert.match(gate, /addLine\.mutateAsync\(\{ kind, text, origin: "preflight"/)
  assert.doesNotMatch(
    gate.slice(gate.indexOf("const addToSlot"), gate.indexOf("// ── run")),
    /preflight\.proposals/,
  )
})

test("dropping a chip is not a one-way door", () => {
  // The groups render the resolver's PLACED lines and the asks render the
  // unanswered ones, so a dropped line appears in neither — a mis-tap could
  // only be undone by retyping the statement.
  assert.match(gate, /undo\.mutateAsync\(entryId\)/)
  assert.match(jfooter, /onUndo\(undoable\.id\)/)

  // The last change of THIS session, not the last row of a log that outlives
  // the modal — otherwise reopening it offers to undo something from last week.
  assert.match(gate, /order\.log\.length <= logBase/)
  assert.match(gate, /setLogBase\(null\)/)

  // One step back, never a changelog.
  assert.doesNotMatch(jfooter, /log\.slice/, "one entry, not a list")
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
  assert.match(useOrder, /const answerLine = \([\s\S]{0,120}patchLine\(client, lineId, \{ status \}\)/)
  assert.match(useOrder, /scope: LINE_SCOPE/)
  assert.match(useOrder, /onError: \(\) => rereadTruth\(client\)/)
  assert.doesNotMatch(useOrder, /setQueryData\(preflightKeys\.order\(\), ctx\.prev\)/)
  assert.match(useOrder, /if \(seq < landed\.current\) return/)
})

test("the CV chip goes to the workspace, not a storage URL", () => {
  assert.match(signoff, /href="\/cv"/)
  const code = signoff.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
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
  assert.match(running, /pf-run-tape/)
  assert.doesNotMatch(running, /pf-run-hero|pf-run-pin|pf-contract/)
})

test("signing off does not dispatch a second run", () => {
  assert.match(gate, /refreshVm\.attach\(result\)/)
  assert.doesNotMatch(gate, /refreshVm\.refresh\(\)/)
})

test("literals live in the palette block and nowhere else", () => {
  // The old rule was a blanket hex ban with a hole big enough to lose the
  // design through: every colour came from `--tm-interactive`, which is TEAL
  // in the product's default dark theme. The rule passed, the modal shipped in
  // the wrong colour on a flat ground, because nothing asserted what the
  // tokens RESOLVED to. Green board, unreadable app.
  const palette = shellCss.slice(
    shellCss.indexOf("/* ── the surface palette"),
    shellCss.indexOf("/* ── shell"),
  )
  assert.ok(palette.length > 200, "the palette block must exist and be findable")

  const consumers = [shellCss.replace(palette, ""), chipCss, journeyCss, surfaceCss]
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
  assert.doesNotMatch(consumers, /#[0-9a-fA-F]{6}\b/, "consume the palette, do not restate it")
  assert.doesNotMatch(consumers, /rgba\(255, ?76, ?0/, "use --pf-accent-glow, not raw orange")
})

test("no rule survives the element it styled", () => {
  // Six screens' worth of chrome once outlived their screens — 225 lines
  // describing a modal that no longer existed. CSS has no compiler to notice,
  // so the check is here. The journey rebuild deleted a second wave of it
  // (`pf-canvas*`, `pf-slot*`, `pf-plate` the card); this keeps the next one
  // from accumulating.
  const declared = new Set<string>()
  for (const file of [
    "preflight.css", "chip.css", "journey.css", "surface.css",
    "screen-running.css", "market-sheet.css",
  ]) {
    let css: string
    try {
      css = read(`components/preflight/${file}`)
    } catch {
      continue // deleted with its surface
    }
    // Comments first: a comment explaining why `.pf-plate` is gone must not
    // be read as a rule declaring it. A guard that flags its own rationale is
    // one people delete.
    for (const [, name] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.((?:pf|jr)-[a-z0-9-]+)/g)) {
      declared.add(name)
    }
  }

  const rendered = new Set<string>()
  for (const file of [
    "components/preflight/preflight-gate.tsx",
    "components/preflight/journey.tsx",
    "components/preflight/journey-footer.tsx",
    "components/preflight/step-slot.tsx",
    "components/preflight/step-signoff.tsx",
    "components/preflight/step-open.tsx",
    "components/preflight/chip.tsx",
    "components/preflight/chip-group.tsx",
    "components/target-location/location-picker.tsx",
    "components/preflight/conflict-plate.tsx",
    "components/preflight/heard-row.tsx",
    "components/preflight/say-band.tsx",
    "components/preflight/screen-running.tsx",
    "components/preflight/preflight-header.tsx",
    "components/journey/journey-chrome.tsx",
    "components/preflight/typing.tsx",
  ]) {
    for (const [, name] of read(file).matchAll(/((?:pf|jr)-[a-z0-9-]+)/g)) rendered.add(name)
  }

  const orphans = [...declared].filter((name) => !rendered.has(name)).sort()
  assert.deepEqual(orphans, [], `CSS for elements nothing renders: ${orphans.join(", ")}`)
})

test("reduced motion is honoured on every animated surface", () => {
  for (const file of [
    "components/preflight/preflight.css",
    "components/preflight/journey.css",
    "components/preflight/surface.css",
    "components/journey/journey-chrome.css",
    "components/preflight/screen-running.css",
  ]) {
    assert.match(read(file), /prefers-reduced-motion: reduce/, `${file} must honour reduced motion`)
  }
})

test("every Myro utterance pad is SayPad, not a one-line input", () => {
  for (const [name, file] of [
    ["opening", "components/preflight/step-open.tsx"],
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
  assert.match(jfooter, /price\?\.run_cost \?\? 0/)
  for (const [name, src] of [["gate", gate], ["journey", journey], ["footer", jfooter]] as const) {
    assert.doesNotMatch(src, /MYRO_COINS_POLICY|matchRefreshCost/, `${name} must not price a run`)
  }
})

test("the price is its own request, and only the button waits for it", () => {
  // Pricing needs `count_new_jobs_for_user`, a count over `jobs` that
  // read-timed-out at 8s four times in one hour of prod logs. Riding on
  // `GET /preflight/order` it held the plates, the say band and every edit
  // hostage to a number that only decides what the button says.
  assert.match(useOrder, /price: \(\) => \["preflight", "price"\]/)
  assert.match(useOrder, /export function usePreflightPrice/)
  assert.match(gate, /usePreflightPrice\(token, open\)/)

  // The order render path must not reference the price at all.
  const types = read("lib/preflight/types.ts")
  const orderShape = types.slice(types.indexOf("export interface Order extends OrderState"))
  assert.doesNotMatch(orderShape.slice(0, 200), /run_cost/, "the price is off the order")

  // Run is the ONE control that waits: pressing it unpriced would be
  // consenting to a charge nobody has been shown.
  assert.match(jfooter, /starting \|\| blocked \|\| short \|\| !price/)
  // …and it shows no figure until there is one.
  assert.match(jfooter, /\? "pricing"/)
})

/* ── a second search ──────────────────────────────────────────────────────── */

test("a second search is opened by /tracks, never by the order's apply", () => {
  // `/order/apply` acts on add and drop, so an `open_track` effect sent there
  // is a silent no-op: the user says yes and nothing exists. It also has to
  // re-check the gate at write time — the proposal was built when `can_open`
  // was true and may not be by the time the yes lands.
  assert.match(gate, /proposal\.effects\.find\(\(e\) => e\.op === "open_track"\)/)
  assert.match(gate, /tracksApi\.open\(token!, \{/)
  assert.match(gate, /role_titles: track\.role_titles \?\? \[\]/)
  // The branch returns; a track must never also be pushed through apply.
  const branch = gate.slice(gate.indexOf("const track = proposal.effects.find"))
  assert.match(branch.slice(0, 700), /return\n?\s*\}/)

  const api = read("lib/api.ts")
  assert.match(api, /export const tracks = \{/)
  assert.match(api, /request<TracksState>\("\/tracks", \{\s*\n\s*method: "POST"/)
})

test("the gate's reason is rendered, and it is never a lock", () => {
  // There is a server-side test asserting `blocked_reason` never contains
  // "lock". The UI must not say what the API refuses to — no padlock, no
  // "Pro", no "coming soon".
  const api = read("lib/api.ts")
  const block = api.slice(api.indexOf("export const tracks"), api.indexOf("export const users"))
  const types = api.slice(api.indexOf("export interface TracksState"))
  assert.match(types.slice(0, 400), /blocked_reason: string \| null/)
  for (const src of [block, gate]) {
    assert.doesNotMatch(src, /padlock|🔒|"Pro"|coming soon/i)
  }
})

/* ── the journey ──────────────────────────────────────────────────────────── */

test("the primary action is pinned, never the end of a scroll", () => {
  // The whole reason for the rebuild. The run bar used to be the last thing
  // under six slot groups, the facts, the say band and the heard fold — on a
  // real order, ~1,100px of content in a 640px box.
  assert.match(shellCss, /\.pf-body \{[\s\S]{0,200}overflow-y: auto/)
  assert.match(journeyCss, /\.pf-footer \{[\s\S]{0,240}flex-shrink: 0/)
  assert.match(shellCss, /\.pf-head \{[\s\S]{0,200}flex-shrink: 0/)
  // One primary per screen, and the label is a verb.
  assert.match(jfooter, /primaryLabel=\{isLast \? "Run" : "Continue"\}/)
  assert.match(chromeCss, /\.jr-primary \{[\s\S]{0,400}border-radius: var\(--tm-button-radius\)/)
})

test("a settled order opens on Sign off — steps are for filling, not a toll", () => {
  // The risk a stepped flow carries is the opposite of the one it fixes: a
  // user whose order is already right must not tap Continue four times to
  // change nothing. The landing rule is what makes the journey safe.
  const steps = read("lib/preflight/journey.ts")
  assert.match(steps, /export function landingStep/)
  assert.match(steps, /return "signoff"/)
  assert.match(journey, /useState\(\(\) => indexOfStep\(landingStep\(need, intent\)\)\)/)
  // Computed ONCE. Recomputing as the user answers would move the screen out
  // from under them mid-tap.
  assert.doesNotMatch(journey, /useEffect\([\s\S]{0,200}landingStep/)
})

test("the ribbon is navigation, and says which step still asks something", () => {
  // A ticked sequence that cannot be clicked still looks like one that can —
  // `JourneyProgress` in onboarding learned this when the only route back was
  // a control that destroyed the answer behind it.
  assert.match(chrome, /onClick=\{\(\) => onJump\(step\.key\)\}/)
  assert.match(chrome, /data-asks=/)
  assert.match(chromeCss, /\.jr-seg\[data-asks="true"\]::before/)
  // Unlabelled: six words across 560px is legible and across 375px is not.
  assert.doesNotMatch(chrome, /<span[^>]*>\{step\.title\}<\/span>/)
  // …but the label still reaches a screen reader.
  assert.match(chrome, /aria-label=\{step\.askLabel \? `\$\{step\.title\}/)
  // The modal repaints the shared chrome in its own palette rather than
  // redefining an app token at its root, which would reach the chips too.
  assert.match(journeyCss, /\.pf-modal \.jr-seg \{ background: var\(--pf-stroke\)/)
})

test("a guess is asked beside the slot it would change", () => {
  // They used to sit in one fold at the bottom ("14 things Myro heard"), so a
  // question about a city and the Where slot it was about were never on screen
  // together.
  const steps = read("lib/preflight/journey.ts")
  assert.match(steps, /export function stepForKind/)
  assert.match(steps, /export function stepForProposal/)
  assert.match(journey, /stepForKind\(l\.kind\) === step\.key/)
  assert.match(journey, /stepForProposal\(p\) === step\.key/)
  // An unroutable proposal lands on Sign off rather than nowhere: a guess that
  // renders on no screen is one the user is never asked about and the run then
  // discards in silence.
  assert.match(steps, /return "signoff"\n\}/)
})

test("Skip is offered only where there is something to skip", () => {
  // "Skip for now" under a step the user has already filled offers to skip
  // nothing, and under the work slot it would offer to skip the search.
  assert.match(journey, /step\.optional/)
  assert.match(journey, /groups\.every\(\(g\) => g\.lines\.length === 0\)/)
  assert.match(chrome, /secondaryLabel && onSecondary \?/)
  const steps = read("lib/preflight/journey.ts")
  const work = steps.slice(steps.indexOf('key: "work"'), steps.indexOf('key: "where"'))
  assert.match(work, /optional: false/, "the work slot is the search; it cannot be skipped")
})

test("the chip is a third of the plate, and keeps everything the plate carried", () => {
  // The density fix, stated as a rule so the card cannot come back: no blur,
  // no drop shadow, no inset — twenty blurred surfaces is twenty compositor
  // layers on a phone, for two words each.
  assert.doesNotMatch(chipCss, /backdrop-filter/)
  assert.doesNotMatch(chipCss, /box-shadow/)
  // Reword and drop both survive, and the row wraps.
  assert.match(chip, /aria-label=\{`Edit \$\{line\.text\}`\}/)
  assert.match(chip, /aria-label=\{`Remove \$\{line\.text\}`\}/)
  assert.match(chipCss, /\.pf-chips \{[\s\S]{0,160}flex-wrap: wrap/)
})

test("nothing on a chip is set in a token that fails contrast in light", () => {
  // `--tm-text-faint` measures 2.65:1 against the light modal ground. The
  // drift guard's faint-text rule keys on >=13px and the chip's text is
  // 12.5px, its note 11.5px and its counter 10px — so all three slipped
  // under it, and all three are things the reader has to be able to read:
  // the empty state's only words, an instruction ("reword it"), and "6 of 6".
  const live = chipCss.replace(/\/\*[\s\S]*?\*\//g, "")
  assert.doesNotMatch(
    live,
    /--tm-text-faint/,
    "chip text, its note and its counter are muted, not faint — see the light-theme measurements",
  )
})

test("the step head is the biggest thing on the screen", () => {
  // The surface this replaced put six 13px fields under 10px uppercase
  // labels, so the order being signed off was the smallest thing in the modal.
  assert.match(chromeCss, /\.jr-title \{[\s\S]{0,200}font-size: clamp\(24px/)
  assert.match(chromeCss, /\.jr-lede \{[\s\S]{0,200}font-size: var\(--tm-fs-meta\)/)
})
