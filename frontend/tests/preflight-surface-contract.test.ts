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
  const direct = (useOrder.match(/onSuccess: \(next\) => mergeState\(client, next\)/g) ?? []).length
  const sequenced = (useOrder.match(/onSuccess: \(next, vars\) => mergeIfNewest\(vars\.seq, next\)/g) ?? []).length
  // said / addLine / apply / undo merge directly; the two line mutations merge
  // through the sequence guard so a stale reply cannot overwrite newer state.
  assert.equal(direct, 4, `expected 4 direct merges; found ${direct}`)
  assert.equal(sequenced, 2, `expected 2 sequenced merges; found ${sequenced}`)
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
  // that skips the proposals. The bar itself stays gone until there is a next
  // step; a ghost back-caption was words doing the bubble's edit job.
  const footer = read("components/preflight/gate-footer.tsx")
  assert.match(footer, /if \(screen === "proposals" && thinking\) return null/)
})

test("the utterance is edited on the bubble, not captioned in the footer", () => {
  const bubble = read("components/preflight/user-said-bubble.tsx")
  const footer = read("components/preflight/gate-footer.tsx")
  const sayIt = read("components/preflight/screen-say-it.tsx")
  assert.match(bubble, /aria-label="Edit what you said"/)
  assert.match(gate, /<UserSaidBubble/)
  assert.match(sayIt, /draft/)
  assert.doesNotMatch(gate, /say it differently/)
  assert.doesNotMatch(footer, /say it differently/)
})

test("a Myro question is not rendered as an unanswerable bubble", () => {
  // The reply slot is an acknowledgement. A question belongs as a proposal row
  // with yes/no — showing it as prose is a dead end.
  const reply = read("lib/preflight/reply.ts")
  const proposals = read("components/preflight/screen-proposals.tsx")
  assert.match(reply, /text\.includes\("\?"\)/)
  assert.match(proposals, /ackFromReply/)
})

test("a settled claim is marked, not narrated as yes", () => {
  const proposals = read("components/preflight/screen-proposals.tsx")
  assert.doesNotMatch(proposals, /✓ yes/)
  assert.doesNotMatch(proposals, /of \$\{proposals\.length\} accepted/)
  assert.match(proposals, /aria-label="Undo"/)
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
  const footer = read("components/preflight/gate-footer.tsx")
  assert.match(footer, /Continue · drop \$\{proposalDrops\}/)
  assert.match(footer, /unanswered → dropped/)
  // The run price comes from the server, never a client constant.
  assert.match(gate, /order\?\.run_cost \?\? 0/)
  assert.doesNotMatch(gate, /MYRO_COINS_POLICY|matchRefreshCost/)
})

/* ── regressions from the 2026-08-16 authed session ─────────────────────── */

test("Run is single-flight — the button cannot queue a second charge", () => {
  // It had no in-flight guard at all. A sign-off that takes a few seconds looks
  // like nothing happened, the user presses again, and every call that reaches
  // the server is another MATCH_RUN_COST off their wallet.
  assert.match(gate, /if \(!token \|\| starting\) return/)
  assert.match(gate, /setStarting\(true\)/)
  assert.match(gate, /busy=\{apply\.isPending \|\| starting\}/)
})

test("a failed run never claims nothing was charged", () => {
  // The server stamps the ticket only after the charge succeeds, but a client
  // that saw a timeout does not know which side of that line it landed on.
  assert.doesNotMatch(gate, /Nothing was charged/)
})

test("the run is given a write's timeout, not a read's", () => {
  // 15s (the default, tuned for reads) cut off a request that projects the
  // order onto the profile, rewrites the lean facts, charges and dispatches.
  const api = read("lib/api.ts")
  const run = api.slice(api.indexOf('run: (token: string) =>'))
  assert.match(run.slice(0, 400), /timeoutMs: 45_000/)
})

test("an answer paints immediately and is never rolled back to a stale snapshot", () => {
  const hook = read("lib/preflight/use-order.ts")
  // The patch happens on click, not in onMutate — with a scoped queue onMutate
  // runs when the request finally starts, which is the "not accepting my
  // clicks" symptom.
  assert.match(hook, /const answerLine = \([\s\S]{0,120}patchLine\(client, lineId, \{ status \}\)/)
  assert.match(hook, /scope: LINE_SCOPE/)
  // Restoring a snapshot taken several clicks ago would erase the answers in
  // between; only the server knows which landed.
  assert.match(hook, /onError: \(\) => rereadTruth\(client\)/)
  assert.doesNotMatch(hook, /setQueryData\(preflightKeys\.order\(\), ctx\.prev\)/)
  // A stale reply must not overwrite newer optimistic state.
  assert.match(hook, /if \(seq < landed\.current\) return/)
})

test("answering is never blocked on the previous answer's request", () => {
  const confirm = read("components/preflight/screen-confirm.tsx")
  assert.doesNotMatch(gate, /busy=\{answer\.isPending/)
  assert.match(confirm, /busy\?: boolean/, "the prop may exist, but the gate must not gate on pending")
})

test("the CV chip goes to the workspace, not a storage URL", () => {
  // `profile.cv_url` is a Supabase storage link: opening it leaves the session
  // behind and greets the user with a login screen.
  const review = read("components/preflight/screen-review.tsx")
  assert.match(review, /href="\/cv"/)
  // Comments stripped — `cv_url` is named in the note explaining why it is gone.
  const code = review.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.doesNotMatch(code, /cvHref|cv_url/)
  assert.doesNotMatch(gate.replace(/\/\*[\s\S]*?\*\//g, ""), /cvUrl/)
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
    read("components/preflight/screen-say-it.css"),
    read("components/myro/say-pad.css"),
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

test("every Myro utterance pad is SayPad, not a one-line input", () => {
  for (const [name, file] of [
    ["say-it", "components/preflight/screen-say-it.tsx"],
    ["sheet", "components/preflight/market-sheet.tsx"],
    ["chat", "components/myro/myro-chat.tsx"],
    ["memory", "components/cv/builder/memory-panel.tsx"],
    ["proposals", "components/preflight/screen-proposals.tsx"],
    ["guess", "components/preflight/guess-row.tsx"],
  ] as const) {
    assert.match(read(file), /<SayPad/, `${name} uses SayPad`)
  }
  const pad = read("components/myro/say-pad.tsx")
  assert.match(pad, /<textarea/)
  assert.match(pad, /e\.key === "Enter" && !e\.shiftKey/)
})

test("screen 1 states the reward and the price before the ask", () => {
  const sayIt = read("components/preflight/screen-say-it.tsx")
  assert.match(gate, /newJobs=\{order\?\.new_jobs_count/)
  assert.match(gate, /runCost=\{runCost\}/)
  assert.match(sayIt, /rolesWaitingCopy/)
  assert.match(sayIt, /searchCostCopy/)
  assert.match(sayIt, /Name the work/)
  assert.doesNotMatch(sayIt, /What kind of work/)
  assert.doesNotMatch(sayIt, /notes/)
})

test("CV chips are proof, not a dashed stub form", () => {
  const css = read("components/preflight/preflight.css")
  const sayIt = read("components/preflight/screen-say-it.tsx")
  assert.doesNotMatch(css, /border: 1px dashed/)
  assert.doesNotMatch(sayIt, /\+ \{word\}/)
  assert.match(sayIt, /From your CV/)
  assert.match(sayIt, /appendStarter/)
})

test("the pad rests on the border token, and idle send is a ghost", () => {
  const css = read("components/preflight/preflight.css")
  assert.match(css, /\.pf-input \{[\s\S]*?border: 1px solid var\(--tm-border\)/)
  assert.match(css, /\.pf-send\[data-idle="true"\] \{[\s\S]*?background: transparent/)
})

test("the ribbon names chapters, not three equal clicks", () => {
  const header = read("components/preflight/preflight-header.tsx")
  assert.match(header, /label: "Name"/)
  assert.match(header, /label: "Check"/)
  assert.match(header, /label: "Search"/)
  assert.match(header, /Check · \$\{confirmProgress\.current\} of \$\{confirmProgress\.total\}/)
  assert.match(gate, /compact=\{screen === "start"\}/)
})

