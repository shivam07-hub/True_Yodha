import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

test("agent pick cards use the same Skip / Save / Share triage as the feed", () => {
  const band = read("../components/jobs/agent-picks-band.tsx")
  const mobile = read("../mobile/redesign/agent-picks-mobile.tsx")

  assert.match(band, /<JobCard /, "desktop Agent Picks must render the shared JobCard")
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
