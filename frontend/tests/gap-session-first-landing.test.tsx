/**
 * R2: the first gap deck is short, the match meter stays hidden until an
 * Accept, and an empty first deck hands the person the weave offer.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { GapSession } from "../components/cv/builder/gap-session"
import type { GapPlanResponse } from "../lib/api"

const noop = () => {}

function plan(opts: {
  latent?: string[]
  shallow?: string[]
  absent?: string[]
}): GapPlanResponse {
  const latent = opts.latent ?? []
  const shallow = opts.shallow ?? []
  const absent = opts.absent ?? []
  return {
    job_id: "job-1",
    job_title: "Analyst",
    company: "Acme",
    host_bullet_cards: latent.map((name, i) => ({
      order: 10 + i,
      section: "experience",
      item_index: 0,
      bullet_index: i,
      bullet_text: `Showed ${name} on a live account.`,
      skills: [{ skill: name.toLowerCase(), display_name: name }],
    })),
    below_level_cards: shallow.map((name) => ({
      order: 0,
      skill: name.toLowerCase(),
      display_name: name,
      current_level: 2,
      required_level: 4,
      surface_to: 3,
      is_primary: false,
      host: {
        section: "experience",
        item_index: 0,
        bullet_index: 9,
        bullet_text: `Touched ${name} once.`,
      },
      ladder_max_level: 0,
    })),
    absent_skills: absent.map((name) => ({
      skill: name.toLowerCase(),
      display_name: name,
      is_primary: true,
      required_level: 3,
      ladder_max_level: 0,
    })),
    upgrade_offers: [],
    total_actionable: latent.length + shallow.length,
    shown: latent.length + shallow.length,
    remaining: 0,
  }
}

function ticks(html: string): number {
  return html.match(/cvb-gs-tick(?: |")/g)?.length ?? 0
}

function session(props: {
  plan: GapPlanResponse
  firstLanding: boolean
  score?: number
  startScore?: number
  accepted?: number
  focusRequirement?: string
  onNothingToWalk?: () => void
}) {
  return renderToStaticMarkup(
    <GapSession
      token="tok"
      jobId="job-1"
      score={props.score ?? 12}
      startScore={props.startScore}
      plan={props.plan}
      firstLanding={props.firstLanding}
      accepted={props.accepted ?? 0}
      focusRequirement={props.focusRequirement}
      onApplied={noop}
      onClose={noop}
      onNothingToWalk={props.onNothingToWalk ?? noop}
    />,
  )
}

const mixed = plan({ latent: ["SQL", "Python", "Tableau"], shallow: ["Excel"] })

test("a first landing walks at most three cards, latent first, with no meter", () => {
  const html = session({ plan: mixed, firstLanding: true })
  assert.equal(ticks(html), 3)
  assert.match(html, /SQL/)
  assert.doesNotMatch(html, /Excel/)
  assert.doesNotMatch(html, /cvb-gs-meter/)
  assert.doesNotMatch(html, /JD match/)
})

test("the meter appears after one accept and stays off the first card", () => {
  const before = session({ plan: mixed, firstLanding: true, accepted: 0 })
  const after = session({ plan: mixed, firstLanding: true, accepted: 1, score: 18 })
  assert.doesNotMatch(before, /cvb-gs-meter/)
  assert.match(after, /cvb-gs-meter/)
  assert.match(after, /JD match 18%/)
  assert.equal(ticks(after), 3)
})

test("a later visit to the same job walks the full deck", () => {
  const html = session({ plan: mixed, firstLanding: false })
  assert.equal(ticks(html), 4)
  assert.match(html, /Excel/)
  assert.match(html, /cvb-gs-meter/)
})

test("a first landing with nothing to walk hands off once and skips the closing panel", async () => {
  let calls = 0
  const html = session({
    plan: plan({ absent: ["Kubernetes"] }),
    firstLanding: true,
    onNothingToWalk: () => { calls += 1 },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(calls, 1)
  assert.doesNotMatch(html, /cvb-gs-closing/)
  assert.doesNotMatch(html, /Build these in practice/)
  assert.doesNotMatch(html, /No gaps to close/)
})

test("a later visit with an empty deck keeps the closing panel", async () => {
  let calls = 0
  const html = session({
    plan: plan({ absent: ["Kubernetes"] }),
    firstLanding: false,
    score: 68,
    startScore: 0,
    onNothingToWalk: () => { calls += 1 },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(calls, 0)
  assert.match(html, /cvb-gs-closing/)
  assert.match(html, /Kubernetes/)
})

test("the climb stays hidden when nothing was surfaced", () => {
  const html = session({
    plan: plan({ absent: ["Kubernetes"] }),
    firstLanding: false,
    score: 68,
    startScore: 0,
    accepted: 0,
  })
  assert.match(html, /cvb-gs-closing/)
  assert.doesNotMatch(html, /cvb-gs-climb/)
  assert.doesNotMatch(html, /0%/)
})

// A Skills-map row is a CV gap first. Practice is the step after the CV, not
// instead of it: Sterlite's "Take qualified leads through proposals,
// negotiation and signed contracts" opened "Build these in practice ·
// Negotiation" on a CV holding $2M+ of signed contracts (2026-11-27).
test("a clicked gap with no CV line to rewrite goes to Mentor, not to practice", async () => {
  let calls = 0
  const html = session({
    plan: plan({ latent: ["SQL"], absent: ["Negotiation"] }),
    firstLanding: false,
    focusRequirement: "Take qualified leads through proposals, negotiation and signed contracts",
    onNothingToWalk: () => { calls += 1 },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(calls, 1)
  assert.doesNotMatch(html, /Build these in practice/)
})

test("a clicked gap with a CV line opens that line, and Mentor is not called", async () => {
  let calls = 0
  const html = session({
    plan: plan({ latent: ["Negotiation"], absent: ["Kubernetes"] }),
    firstLanding: false,
    focusRequirement: "Negotiation with enterprise clients",
    onNothingToWalk: () => { calls += 1 },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(calls, 0)
  assert.match(html, /Showed Negotiation on a live account/)
  assert.doesNotMatch(html, /Build these in practice/)
})
