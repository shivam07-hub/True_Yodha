/**
 * The unlock moment — Job Tracks slice 3b.
 *
 * The gate this hangs off was dead for the whole feature's life:
 * `tailored_cv_created_at` had one writer (`POST /onboarding/milestones/...`)
 * and no callers anywhere, so it was NULL for all 141 users with onboarding
 * state while 11 of them held 66 tailored `cv_versions` rows. `can_open_another`
 * refused everybody and Job Tracks was unreachable in production.
 *
 * These assert the two halves that make the offer real: the client re-reads the
 * gate at the moment the server flips it, and the offer never becomes a nag.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const done = read("components/cv/builder/tailor-done.tsx")
const weave = read("components/cv/builder/tailor-weave.tsx")
const hook = read("lib/hooks/use-tracks.ts")

test("the offer waits for the moment the loop closes, and not a second before", () => {
  // The handoff is specific: `can_open` flips when a CV is tailored for a job in
  // the first search, and THAT is when to offer — they have just felt the whole
  // loop close and know what a search is for. Before it, do not advertise.
  assert.match(done, /const offer = canOpen && tracks\.length < 2/)
  assert.match(done, /\{offer \?/)
})

test("the gate is re-read when the tailor lands, not on the next visit", () => {
  // The server stamps the milestone inside the same write, so the cached
  // `can_open` is wrong the instant the apply returns. Without this the offer
  // shows one tailor late — which, on a panel the user is looking at right now,
  // means never.
  assert.match(done, /export function useTailorGateRefresh/)
  assert.match(done, /invalidateQueries\(\{ queryKey: trackKeys\.all\(\) \}\)/)
  assert.match(weave, /refreshTrackGate\(\)/)
  const apply = weave.slice(weave.indexOf("const applyWeave"), weave.indexOf("const changedRoles"))
  assert.match(apply, /refreshTrackGate\(\)/, "the refresh belongs to the apply, not to mount")
})

test("the offer opens the say band; it never creates a search", () => {
  // A track is the user's own words or it is nothing. A button here cannot know
  // what the second search IS, so it opens the door where the mentor turns a
  // sentence into one typed proposal — the path slice 2 built.
  assert.match(done, /openRefreshGate\("say"\)/)
  assert.doesNotMatch(done, /tracksApi|tracks\.open|POST/, "the offer proposes, it does not create")
})

test("it stops offering once they have a second search", () => {
  // A success screen that keeps selling reads as a success screen that wanted
  // something. `tracks.length < 2` retires it with no new state to store.
  assert.match(done, /tracks\.length < 2/)
})

test("the refusal is never rendered as a lock", () => {
  // There is a server test asserting `blocked_reason` never contains "lock".
  // The UI must not say what the API refuses to — and right now it says nothing
  // at all, because nothing renders a refusal yet.
  assert.doesNotMatch(hook, /blockedReason/, "nothing reads it yet; do not export a gate with no consumer")
  // Comments stripped: both files NAME the banned words while explaining why
  // they are banned, and a guard that flags its own rationale is one people
  // delete rather than obey.
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const [name, src] of [["done panel", done], ["hook", hook]] as const) {
    assert.doesNotMatch(code(src), /padlock|🔒|"Pro"|coming soon|\bLocked\b/i, `${name} must not lock`)
  }
})

test("the button is a verb, and the line above it says what a search is", () => {
  // ≤3 common words on a label; the sentence carries the meaning, once, at the
  // only moment the user has never heard of a second search.
  assert.match(done, /Add a search/)
  assert.match(done, /its own matches and its own CV/)
})
