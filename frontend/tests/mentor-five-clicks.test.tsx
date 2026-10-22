/**
 * FD2 (2026-10-20): door to Download in five clicks. The Mentor modal's part:
 * "Weave now · 50" on every question, "Take all" on a fresh review, and no
 * "Every line is decided" screen — the modal closes when the last write lands.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { WeaveReview } from "../components/cv/builder/weave-review"
import { interviewActions } from "../lib/cv/interview-actions"
import type { WeaveStep } from "../lib/cv/weave-steps"

test("a question before the last offers to weave now, at its price", () => {
  assert.deepEqual(interviewActions(0, 5, 50), { skipLabel: "Skip", weaveNowLabel: "Weave now · 50" })
  assert.deepEqual(interviewActions(3, 5, 50), { skipLabel: "Skip", weaveNowLabel: "Weave now · 50" })
})

test("the last question keeps one button that skips and weaves", () => {
  assert.deepEqual(interviewActions(4, 5, 50), { skipLabel: "Skip & weave · 50", weaveNowLabel: null })
  assert.deepEqual(interviewActions(0, 1, 50), { skipLabel: "Skip & weave · 50", weaveNowLabel: null })
})

const noop = () => {}

const steps: WeaveStep[] = [
  { kind: "extras", summary: "BD Manager at Capgemini. Six years in sales.", skillsLine: null },
  {
    kind: "role",
    role: {
      role_index: 0, role: "BD Manager", company: "Capgemini", changed: true, guarded: false,
      edit_kind: "rewrite", why: "", bullets: [{ text: "Merged.", from_lines: [], story_titles: [], used_answer: false }],
      dropped_lines: [],
    } as unknown as Extract<WeaveStep, { kind: "role" }>["role"],
  },
]

function review(props: Partial<Parameters<typeof WeaveReview>[0]>) {
  return renderToStaticMarkup(
    <WeaveReview
      steps={steps} idx={0} originals={new Set()} currentSummary="Old" currentSkillsLine=""
      error={null} saving={false} onToggleOriginal={noop} onDecide={noop} onTakeAll={noop}
      onBack={noop} onDone={noop} {...props}
    />,
  )
}

test("a fresh review leads with Take all and keeps a way to review each card", () => {
  const html = review({})
  assert.match(html, /Take all/)
  assert.match(html, /Review each/)
  assert.doesNotMatch(html, /Take this/)
})

test("once a card is decided the review is the stepper again", () => {
  const html = review({ idx: 1 })
  assert.match(html, /Take this/)
  assert.doesNotMatch(html, /Take all/)
})

test("there is no 'every line is decided' screen to click past", () => {
  const html = review({ idx: 2, saving: true })
  assert.doesNotMatch(html, /Every line is decided|Back to the paper/)
  assert.match(html, /Saving/)
})

test("a failed last write stays open and says so", () => {
  const html = review({ idx: 2, error: "Could not save that." })
  assert.match(html, /Could not save that\./)
  assert.match(html, /Back to the paper/)
})
