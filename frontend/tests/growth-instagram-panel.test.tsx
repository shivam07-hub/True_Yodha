import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { GrowthInstagramPublish } from "../components/growth/growth-instagram"
import { GrowthWorkbench } from "../components/growth/growth-workbench"
import type { GrowthMessage } from "../lib/api"

const message: GrowthMessage = {
  id: "message-1",
  legacy_key: null,
  campaign_id: null,
  asset_id: null,
  channel: "instagram",
  format: "carousel",
  variant: "primary",
  audience: null,
  intent: null,
  subject: null,
  draft_copy: "Slide 1:\nFirst section.\n\nSlide 2:\nSecond section.",
  final_copy: null,
  call_to_action_url: null,
  utm_url: null,
  composer_url: null,
  status: "ready_for_review",
  automation_level: "assisted",
  sensitivity: "low",
  reviewer_id: null,
  approved_at: null,
  planned_at: null,
  failure_reason: null,
  metadata: { first_comment: "#jobsearch #himyro" },
  created_at: null,
  updated_at: null,
}
const noop = async () => undefined

test("the panel offers the slide picker, the folded caption and the first comment", () => {
  const html = renderToStaticMarkup(<GrowthInstagramPublish message={message} onPublish={noop} />)
  assert.match(html, /type="file"/)
  assert.match(html, /First section\.\n\nSecond section\./)
  assert.match(html, /#jobsearch #himyro/)
  // Publish stays shut until slides are picked.
  assert.match(html, /<button[^>]*disabled=""[^>]*>Publish to Instagram<\/button>/)
})

test("a queued row shows only that it is publishing", () => {
  const html = renderToStaticMarkup(
    <GrowthInstagramPublish message={{ ...message, status: "queued" }} onPublish={noop} />,
  )
  assert.match(html, /Publishing to Instagram/)
  assert.doesNotMatch(html, /type="file"/)
})

test("a failed row shows Meta's reason above a fresh try", () => {
  const html = renderToStaticMarkup(
    <GrowthInstagramPublish
      message={{ ...message, status: "failed", failure_reason: "Invalid parameter" }}
      onPublish={noop}
    />,
  )
  assert.match(html, /role="alert">Invalid parameter</)
  assert.match(html, /type="file"/)
})

test("the workbench shows the panel only when Instagram is connected", () => {
  const props = { message, asset: undefined, publication: undefined, onSave: noop, onPublish: noop }
  assert.doesNotMatch(renderToStaticMarkup(<GrowthWorkbench {...props} />), /Publish to Instagram/)
  assert.match(
    renderToStaticMarkup(<GrowthWorkbench {...props} onPublishInstagram={noop} />),
    /Publish to Instagram/,
  )
  assert.doesNotMatch(
    renderToStaticMarkup(
      <GrowthWorkbench {...props} message={{ ...message, channel: "linkedin" }} onPublishInstagram={noop} />,
    ),
    /Publish to Instagram/,
  )
})
