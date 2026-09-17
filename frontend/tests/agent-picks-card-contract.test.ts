import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

test("agent pick cards use the same Skip / Save / Share triage as the feed", () => {
  const band = read("../components/jobs/agent-picks-band.tsx")
  const mobile = read("../mobile/redesign/agent-picks-mobile.tsx")

  // On /market the band's own card IS the market JobCard. A surface that owns a
  // different card supplies it through `renderCard`; the band must never grow a
  // third shape of its own.
  assert.match(band, /<JobCard\b/, "the feed's Agent Picks must render the shared JobCard")
  assert.match(band, /renderCard/, "a surface must be able to supply its own card")
  assert.match(band, /onSkip=/, "desktop Agent Picks must expose Skip")
  assert.doesNotMatch(
    band,
    /actions=\{\s*<CapturePill/,
    "desktop Agent Picks must not replace triage with a lone Save pill",
  )

  assert.match(mobile, /<SwipeCard/, "phone Agent Picks must render the same swipe job card as the feed")
  assert.match(mobile, /onSkip=/, "phone Agent Picks must expose Skip")
  assert.match(mobile, /onShare=/, "phone Agent Picks must expose Share")
  assert.match(mobile, /enabled: !!token/)
  assert.match(mobile, /lede=\{<AgentPickLede/, "phone Agent Picks must carry the reason inside the card too")
  assert.doesNotMatch(
    mobile,
    /enabled: !!token && context === "collections"/,
    "phone Jobs must fetch Agent Picks itself",
  )
})

test("phone job-card swipe captures the pointer so Skip still works after the mm redesign", () => {
  const swipe = read("../mobile/redesign/use-card-swipe.ts")
  assert.match(swipe, /setPointerCapture/, "swipe-left Skip needs pointer capture or the scroll parent steals the gesture")
  assert.match(swipe, /touchmove/, "iOS only blocks vertical scroll when touchmove is non-passive")
  assert.match(swipe, /passive:\s*false/)
})

test("inside the Ops folder a pick is a collection row, not a Save card", () => {
  // After the Jobs face lock, picks on Collections would ring but still say
  // "Save" — Save and Tailor CV as peers for one decision, on one screen.
  const desktop = read("../components/collections/collections-desktop.tsx")
  assert.match(desktop, /renderCard=/, "Collections must supply its own pick card")
  assert.match(desktop, /openWhy/, "a pick opens on the reason Myro chose it")
  assert.doesNotMatch(desktop, /<JobCard/, "the market Save card must not reach the Ops folder")
})


test("one job, one object: the reason rides inside the card and no pill re-judges it", () => {
  const band = read("../components/jobs/agent-picks-band.tsx")
  const mobile = read("../mobile/redesign/agent-picks-mobile.tsx")
  const lede = read("../components/jobs/agent-pick-lede.tsx")

  // The reason is a slot on the card, not a note stacked above it.
  assert.match(band, /lede=\{<AgentPickLede/, "the market pick must carry its reason inside the card")

  // The ring is the judge (CONTEXT.md Match Verdict). A tier word beside it is a
  // second claim about the same thing, which is what shipped before.
  for (const [name, source] of [["desktop", band], ["phone", mobile]] as const) {
    assert.doesNotMatch(source, /TIER_LABEL/, `${name} Agent Picks must not re-label how good a pick is`)
  }

  // The tag marks the exception only: a pick nobody graded says nothing.
  assert.match(lede, /off_direction/, "the card names a pivot")
  assert.doesNotMatch(lede, /on_direction/, "an on-direction pick needs no tag — that is what the band is")
})

test("the lede carries its own stylesheet, because the phone never imports the feed card's", () => {
  const lede = read("../components/jobs/agent-pick-lede.tsx")
  const css = read("../components/jobs/agent-pick-lede.css")
  assert.match(lede, /import "\.\/agent-pick-lede\.css"/)
  assert.match(css, /\.tm-pick-lede\b/)
  // Token-only: a hardcoded colour here would be right on one surface and wrong
  // on the other.
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/)
})
