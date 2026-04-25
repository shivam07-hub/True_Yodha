import { strict as assert } from "node:assert"
import test from "node:test"

import { extractFromDocument, extractKnownPortal, sourcePlatformFromUrl } from "../src/extractors.js"

function makeElement(textContent = "", attrs = {}) {
  return {
    textContent,
    innerText: textContent,
    getAttribute(name) {
      return attrs[name] ?? null
    },
  }
}

function makeDocument({
  title = "",
  bodyText = "",
  scripts = [],
  selectors = {},
  metas = {},
} = {}) {
  return {
    title,
    body: makeElement(bodyText),
    querySelector(selector) {
      if (selector.startsWith("meta")) return metas[selector] ?? null
      return selectors[selector] ?? null
    },
    querySelectorAll(selector) {
      if (selector === 'script[type="application/ld+json"]') {
        return scripts.map((script) => makeElement(script))
      }
      return []
    },
  }
}

test("extracts selected text before other page signals", () => {
  const doc = makeDocument({ title: "Other page", bodyText: "Short page text" })
  const draft = extractFromDocument(
    doc,
    "https://example.com/job",
    "Selected job description with Python, SQL, and enough detail to be credible.",
  )

  assert.equal(draft.jobDescription, "Selected job description with Python, SQL, and enough detail to be credible.")
  assert.equal(draft.captureMethod, "selected_text")
})

test("extracts JSON-LD JobPosting", () => {
  const doc = makeDocument({
    title: "Data Engineer - Acme",
    scripts: [
      '{"@type":"JobPosting","title":"Data Engineer","hiringOrganization":{"name":"Acme"},"jobLocation":{"address":{"addressLocality":"Bengaluru","addressCountry":"IN"}},"description":"Build pipelines with Python and SQL."}',
    ],
  })

  const draft = extractFromDocument(doc, "https://example.com/job", "")

  assert.equal(draft.roleName, "Data Engineer")
  assert.equal(draft.companyName, "Acme")
  assert.equal(draft.location, "Bengaluru, IN")
  assert.equal(draft.jobDescription, "Build pipelines with Python and SQL.")
  assert.equal(draft.captureMethod, "json_ld")
})

test("extracts known LinkedIn visible page selectors", () => {
  const doc = makeDocument({
    title: "LinkedIn job",
    selectors: {
      ".top-card-layout__title": makeElement("Product Manager"),
      ".topcard__org-name-link, .topcard__flavor--black-link": makeElement("Acme"),
      ".topcard__flavor--bullet": makeElement("Mumbai, India"),
      ".description__text, .show-more-less-html__markup": makeElement("Own roadmap and analytics."),
    },
  })

  const draft = extractKnownPortal(doc, "https://www.linkedin.com/jobs/view/123")

  assert.equal(draft.roleName, "Product Manager")
  assert.equal(draft.companyName, "Acme")
  assert.equal(draft.location, "Mumbai, India")
  assert.equal(draft.captureMethod, "known_portal")
})

test("falls back to visible page text", () => {
  const doc = makeDocument({
    title: "Backend Engineer | ExampleCo",
    bodyText: "Backend Engineer ExampleCo Remote Build services with Python and FastAPI.",
  })

  const draft = extractFromDocument(doc, "https://careers.example.com/backend", "")

  assert.equal(draft.roleName, "Backend Engineer")
  assert.equal(draft.sourcePlatform, "generic")
  assert.equal(draft.captureMethod, "visible_page")
})

test("identifies common source platforms from URLs", () => {
  assert.equal(sourcePlatformFromUrl("https://boards.greenhouse.io/acme/jobs/1"), "greenhouse")
  assert.equal(sourcePlatformFromUrl("https://jobs.lever.co/acme/1"), "lever")
  assert.equal(sourcePlatformFromUrl("https://www.naukri.com/job-listings-1"), "naukri")
  assert.equal(sourcePlatformFromUrl("https://example.com/jobs/1"), "generic")
})
