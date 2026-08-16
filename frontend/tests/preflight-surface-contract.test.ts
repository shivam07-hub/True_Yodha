/**
 * The pre-flight's non-negotiables, asserted against the source.
 *
 * Each of these is a rule the surface exists to enforce rather than a
 * preference, and each one has a specific failure it prevents. A rule that only
 * lives in a review comment is a rule that comes back.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const gate = read("components/preflight/preflight-gate.tsx")
const sheet = read("components/preflight/market-sheet.tsx")
const row = read("components/preflight/guess-row.tsx")
const useOrder = read("lib/preflight/use-order.ts")
const search = read("lib/hooks/use-myro-search.tsx")

test("one page-level entry mounts the gate, and holds no domain logic", () => {
  assert.match(search, /<PreflightGate/)
  // No idea what a deal-breaker, a lean or a guess is.
  for (const term of ["deal_breakers", "wont_take", "OrderLine", "briefFrom"]) {
    assert.doesNotMatch(search, new RegExp(term), `useMyroSearch should not know about ${term}`)
  }
})

test("both surfaces read and write ONE order through one query key", () => {
  // Two components each holding their own copy of "the order" is the split the
  // record was introduced to close, moved one layer up.
  assert.match(useOrder, /order: \(\) => \["preflight", "order"\]/)
  for (const [name, src] of [["gate", gate], ["sheet", sheet]] as const) {
    assert.match(src, /useOrder\(/, `${name} reads the shared order`)
    assert.match(src, /useOrderMutations\(/, `${name} mutates through the shared hook`)
  }
})

test("every mutation writes the server's answer back into the cache", () => {
  // An optimistic patch that never reconciles is a client inventing the order.
  const mutations = useOrder.match(/onSuccess: \(next\) => mergeState\(client, next\)/g) ?? []
  assert.ok(mutations.length >= 5, `expected every mutation to merge; found ${mutations.length}`)
  assert.match(useOrder, /onError: \(_e, _v, ctx\) => \{[\s\S]{0,120}setQueryData\(preflightKeys\.order\(\), ctx\.prev\)/)
})

test("a guess is never rendered without its source", () => {
  // THE bug. A memory string in prose with no attribution is what made the old
  // brief read "You lean toward Prefers roles in corporate functions".
  assert.match(row, /className="pf-source"/)
  assert.match(row, /SOURCE_LABEL\[line\.source\]/)
})

test("a line Myro cannot run is never offered a yes", () => {
  // A yes on an unusable line is a promise the matcher silently ignores.
  assert.match(row, /line\.unusable \? null : \(/)
  // ...and reword is still there, because that is the path that fixes it.
  assert.match(row, /data-kind="reword"/)
})

test("the accessible name of a guess carries its source", () => {
  assert.match(row, /aria-label=\{`\$\{line\.text\} — \$\{SOURCE_LABEL\[line\.source\]\}`\}/)
})

test("only accepted proposals are applied — unanswered ones are dropped", () => {
  assert.match(gate, /const accepted = proposals\.filter\(\(p\) => answers\[p\.id\] === "kept"\)/)
  assert.match(gate, /effects: accepted\.flatMap/)
})

test("waiting is drawn, never narrated", () => {
  // Design over words: if the UI already shows a state, don't add text saying
  // it. Both surfaces showed a sentence ("Myro is reading that…", "thinking…")
  // where the state IS the reply's own container, arriving empty.
  const typing = read("components/preflight/typing.tsx")
  for (const [name, src] of [["gate", gate], ["sheet", sheet]] as const) {
    assert.match(src, /<MyroTyping/, `${name} draws the wait`)
    assert.doesNotMatch(src, /is reading that|thinking…/, `${name} must not narrate the wait`)
  }
  // The words survive exactly where a reader still needs them.
  assert.match(typing, /role="status"/)
  assert.match(typing, /aria-label=\{label\}/)
})

test("nothing is offered to continue to while Myro is still reading", () => {
  // "Continue · keep 0" over an empty card is a true count of a list that has
  // not arrived — it reads as "Myro found nothing" and invites the one click
  // that skips the proposals.
  assert.match(gate, /if \(screen === "proposals" && thinking\)/)
})

test("visible copy says 'inferred', never 'guessed'", () => {
  // The rows below the header are chipped "Myro inferred". A header reading
  // "Myro guessed these" is the screen contradicting itself, and two words for
  // one thing is how a locked vocabulary stops being one.
  // Checked against what renders, not the whole file: `GuessRow`, `guess-row`
  // and `pf-guess` are code identifiers and stay.
  const confirm = read("components/preflight/screen-confirm.tsx")
  assert.match(confirm, /Round \{activeRound \+ 1\} of \{rounds\.length\} · Myro inferred this/)
  assert.doesNotMatch(confirm, /Myro guessed/)
  assert.doesNotMatch(sheet, /no guesses confirmed/)
  // The contract line counts LINES — a rejected one may have been the user's
  // own words, so calling it a guess would tell them Myro proposed it.
  const prose = read("lib/preflight/prose.ts")
  assert.match(prose, /plural\(dropped, "line", "lines"\)/)
  assert.doesNotMatch(prose, /"guess", "guesses"/)
})

test("supporting copy holds one line", () => {
  // The lead is the thing beside the thing. At two lines it competes with the
  // answers under it and re-flows the round whenever the wording moves. The
  // clamp is the guard; the fix is that the copy is written to fit.
  assert.match(read("components/preflight/screen-confirm.tsx"), /pf-round-lead tm-clamp-1/)
  assert.match(read("app/design-tokens.css"), /\.tm-clamp-1 \{ -webkit-line-clamp: 1/)

  const leads = read("lib/preflight/types.ts").match(/ROUND_LEAD[\s\S]*?\n\}/)?.[0] ?? ""
  const values = (leads.match(/: "[^"]+"/g) ?? []).map((m) => m.slice(3, -1))
  assert.equal(values.length, 3, "three rounds, three leads")
  for (const lead of values) {
    // ~45 characters is one line at --tm-fs-prose in a 560px modal. A lead that
    // needs more than that is a lead that will wrap on someone's screen.
    assert.ok(lead.length <= 45, `lead too long for one line (${lead.length}): "${lead}"`)
  }
})

test("the footer states what the next step costs before it is taken", () => {
  assert.match(gate, /Continue · drop \$\{proposalDrops\}/)
  assert.match(gate, /unanswered → dropped/)
  // The run price comes from the server, never a client constant.
  assert.match(gate, /order\?\.run_cost \?\? 0/)
  assert.doesNotMatch(gate, /MYRO_COINS_POLICY|matchRefreshCost/)
})

test("signing off does not dispatch a second run", () => {
  // /preflight/run already charged and started the ticket. Calling refresh()
  // after it would charge twice for one search.
  assert.match(gate, /refreshVm\.attach\(result\)/)
  assert.doesNotMatch(gate, /refreshVm\.refresh\(\)/)
})

test("the market sheet shows the saved order before asking what's wrong", () => {
  // A complaint needs something to be aimed at. The sheet this replaced opened
  // on an empty chat box.
  assert.match(sheet, /Your order · saved in pre-flight/)
  assert.match(sheet, /orderSummaryFrom\(order\)/)
})

test("a market change is a diff against the saved order, with its cost on the button", () => {
  assert.match(sheet, /One change to your saved order/)
  assert.match(sheet, /pending\.costly \? "Apply & re-run · 150" : "Apply & re-run · free"/)
  assert.match(sheet, /Narrowing is free · widening costs a run/)
})

test("undo restores the line and says so", () => {
  assert.match(sheet, /undo\.mutate\(entry\.id/)
  assert.match(sheet, /is off your order again/)
})

test("both surfaces render the order through the ONE prose module", () => {
  // §6: the gate and the sheet must render the identical order string. Two
  // template literals agreeing today is not the same as one module.
  assert.match(gate, /from "\.\/screen-review"/)
  assert.match(read("components/preflight/screen-review.tsx"), /from "@\/lib\/preflight\/prose"/)
  assert.match(sheet, /from "@\/lib\/preflight\/prose"/)
})

test("no surface hardcodes the handoff's hex — tokens carry both themes", () => {
  const css = [
    read("components/preflight/preflight.css"),
    read("components/preflight/guess-row.css"),
    read("components/preflight/proposals.css"),
    read("components/preflight/market-sheet.css"),
  ].join("\n")
  // The spec is written in the light palette; those values ARE the light tokens,
  // so hex would reproduce the design and break the dark theme.
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "")
  assert.doesNotMatch(declarations, /#[0-9a-fA-F]{6}\b/, "use design tokens, not hex")
  assert.doesNotMatch(declarations, /rgba\(255, ?76, ?0/, "use --tm-accent-* washes, not raw orange")
})

test("reduced motion is honoured on every animated surface", () => {
  for (const file of [
    "components/preflight/preflight.css",
    "components/preflight/guess-row.css",
    "components/preflight/proposals.css",
    "components/preflight/market-sheet.css",
  ]) {
    assert.match(read(file), /prefers-reduced-motion: reduce/, `${file} must honour reduced motion`)
  }
})
