import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const currentDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = join(currentDir, "..")

function read(relativePath) {
  return readFileSync(join(frontendRoot, relativePath), "utf8")
}

async function helpers() {
  const url = pathToFileURL(join(frontendRoot, "lib", "beta-feedback.ts"))
  return import(`${url.href}?test=${Date.now()}`)
}

function storage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  }
}

test("beta feedback API exposes authenticated status and final submit calls", () => {
  const source = read("lib/api.ts")
  assert.match(source, /betaAssignmentStatus/)
  assert.match(source, /submitBetaAssignment/)
  assert.match(source, /\/feedback\/beta-assignment/)
})

test("session validation requires context and at least one explored area", async () => {
  const module = await helpers()
  const draft = module.initialBetaFeedbackDraft()

  assert.equal(module.validateSessionStep(draft).areas_explored, "Select at least one area.")

  Object.assign(draft, {
    role_stream: "Product",
    device_type: "Mobile",
    operating_system: "Android",
    browser: "Chrome",
    connection_type: "Mobile data",
    session_outcome: "Completed",
    time_to_value: "5-10 minutes",
    areas_explored: ["CV upload"],
  })
  assert.deepEqual(module.validateSessionStep(draft), {})
})

test("assessment validation rejects vague answers", async () => {
  const module = await helpers()
  const draft = module.initialBetaFeedbackDraft()
  draft.product_understanding = "Too short"

  const errors = module.validateAssessmentStep(draft)

  assert.equal(errors.product_understanding, "Write at least 10 characters.")
  assert.equal(errors.priority_improvement, "Write at least 10 characters.")
})

test("review validation requires five ratings and all confirmations", async () => {
  const module = await helpers()
  const draft = module.initialBetaFeedbackDraft()

  assert.equal(module.validateReviewStep(draft).rating_trust, "Choose a rating.")
  assert.equal(
    module.validateReviewStep(draft).final_submission_confirmation,
    "Confirm that you can send this optional feedback once.",
  )

  Object.assign(draft, {
    rating_next_step: 5,
    rating_trust: 4,
    rating_relevance: 4,
    rating_return: 4,
    rating_recommend: 4,
    privacy_confirmation: true,
    independent_work_confirmation: true,
    final_submission_confirmation: true,
  })
  assert.deepEqual(module.validateReviewStep(draft), {})
})

test("draft storage is versioned and isolated per authenticated user", async () => {
  const module = await helpers()
  const target = storage()
  const draft = module.initialBetaFeedbackDraft()
  draft.role_stream = "Design"

  module.saveBetaFeedbackDraft("user-a", draft, target)

  assert.equal(module.betaFeedbackDraftKey("user-a"), "myro.beta-feedback.v1.user-a")
  assert.equal(module.loadBetaFeedbackDraft("user-a", target).role_stream, "Design")
  assert.equal(module.loadBetaFeedbackDraft("user-b", target).role_stream, "")

  module.clearBetaFeedbackDraft("user-a", target)
  assert.equal(target.values.has("myro.beta-feedback.v1.user-a"), false)
})

test("malformed or old local drafts are discarded", async () => {
  const module = await helpers()
  const target = storage()
  target.setItem("myro.beta-feedback.v1.user-a", JSON.stringify({ version: 0 }))

  assert.equal(module.loadBetaFeedbackDraft("user-a", target).role_stream, "")

  target.setItem("myro.beta-feedback.v1.user-a", "{not-json")
  assert.equal(module.loadBetaFeedbackDraft("user-a", target).role_stream, "")
})

test("beta feedback route renders the optional feedback flow", () => {
  const page = read("app/(authed)/beta-feedback/page.tsx")
  const form = read("components/beta-feedback/beta-feedback-form.tsx")
  const review = read("components/beta-feedback/review-step.tsx")
  const session = read("components/beta-feedback/session-step.tsx")
  const assessment = read("components/beta-feedback/assessment-step.tsx")

  assert.match(page, /BetaFeedbackForm/)
  assert.match(page, /Optional Product Feedback/)
  assert.doesNotMatch(page, /beta testing assessment/i)
  assert.match(form, /Step \{step\} of 3/)
  assert.match(form, /can skip this/i)
  assert.match(form, /Internshala/)
  assert.match(form, /validateSessionStep/)
  assert.match(form, /validateAssessmentStep/)
  assert.match(form, /validateReviewStep/)
  assert.match(form, /ApiError/)
  assert.match(form, /profileQuery\.refetch/)
  assert.match(session, /Your Myro context/)
  assert.match(assessment, /Your observations/)
  assert.doesNotMatch(assessment, /bug/i)
  assert.doesNotMatch(review, /submission is final/i)
  assert.match(review, /Send optional feedback/)
})

test("beta feedback CSS preserves the approved readability contract", () => {
  const css = [
    read("components/beta-feedback/beta-feedback.css"),
    read("components/beta-feedback/beta-feedback-review.css"),
  ].join("\n")

  assert.match(css, /\.bf-card[\s\S]*background:\s*#fff/)
  assert.match(css, /\.bf-title[\s\S]*font-size:\s*26px/)
  assert.match(css, /font-size:\s*16px/)
  assert.match(css, /min-height:\s*50px/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /\.bf-rating-options input:focus-visible \+ span/)
  assert.match(css, /@media \(max-width:\s*480px\)/)
})
