import { strict as assert } from "node:assert"
import test from "node:test"

import { extractFromDocument, extractKnownPortal, sourcePlatformFromUrl } from "../src/extractors.js"
import { enrichMopidPortalDraft, mopidJobIdFromUrl } from "../src/mopid-portal.js"

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

test("extracts known LinkedIn selectors (authenticated view classes)", () => {
  const doc = makeDocument({
    title: "LinkedIn job",
    selectors: {
      ".top-card-layout__title, .job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title": makeElement("Product Manager"),
      ".topcard__org-name-link, .topcard__flavor--black-link, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name": makeElement("Acme"),
      ".topcard__flavor--bullet, .job-details-jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__primary-description": makeElement("Mumbai, India"),
      ".description__text, .show-more-less-html__markup, .jobs-description__content, .jobs-box__html-content": makeElement("Own roadmap and analytics."),
    },
  })

  const draft = extractKnownPortal(doc, "https://www.linkedin.com/jobs/view/123")

  assert.equal(draft.roleName, "Product Manager")
  assert.equal(draft.companyName, "Acme")
  assert.equal(draft.location, "Mumbai, India")
  assert.equal(draft.captureMethod, "known_portal")
})

test("extracts MOPID's visible job header before endpoint enrichment", () => {
  const doc = makeDocument({
    selectors: {
      ".header-wrapper__company__title-section": makeElement("Sales Manager - Real Estate AI SaaS"),
      ".header-wrapper__company__company-section": makeElement("Huvo AI"),
      ".header-wrapper .tags__content": makeElement("Gurugram"),
      ".job-description-container": makeElement("Required fields View Job Description"),
    },
  })

  const draft = extractKnownPortal(doc, "https://start.mopid.me/jobapply/?jobId=687-f96ba")

  assert.equal(draft.roleName, "Sales Manager - Real Estate AI SaaS")
  assert.equal(draft.companyName, "Huvo AI")
  assert.equal(draft.location, "Gurugram")
  assert.equal(draft.captureMethod, "known_portal")
})

test("selected JD does NOT poison company — JSON-LD company still wins (Amazon bug)", () => {
  // Reproduces the amazon.jobs failure: the user selects the JD, the page title
  // is "… - Job ID: 10426211". Old code title-parsed company = "Job ID: 10426211".
  const doc = makeDocument({
    title: "Account Manager I , Amazon Global Selling - Job ID: 10426211",
    scripts: [
      '{"@type":"JobPosting","title":"Account Manager I","hiringOrganization":{"name":"Amazon"},"jobLocation":{"address":{"addressLocality":"Gurgaon","addressCountry":"IN"}},"description":"ignored — selection wins"}',
    ],
  })
  const draft = extractFromDocument(
    doc,
    "https://www.amazon.jobs/en/jobs/10426211/account-manager",
    "Through the Amazon Marketplace, sellers reach millions. Account management, FBA, cold calling.",
  )

  assert.equal(draft.companyName, "Amazon")           // from JSON-LD, not the title
  assert.equal(draft.location, "Gurgaon, IN")
  assert.equal(draft.captureMethod, "selected_text")  // JD still from selection
  assert.match(draft.jobDescription, /Amazon Marketplace/)
})

test("rejects a 'Job ID:' title segment as company", () => {
  const doc = makeDocument({ title: "Account Manager - Job ID: 10426211", bodyText: "Long enough job description text to be captured as the visible page body." })
  const draft = extractFromDocument(doc, "https://example.com/jobs/1", "")

  assert.equal(draft.companyName, null)        // garbage rejected, not stored
  assert.equal(draft.roleName, "Account Manager")
  assert.equal(draft.needsBackstop, true)      // → server LLM fills company
})

test("uses og:site_name as a company fallback", () => {
  const doc = makeDocument({
    title: "Senior Designer",
    metas: { 'meta[property="og:site_name"]': makeElement("", { content: "Figma" }) },
    bodyText: "Design systems and prototyping. A sufficiently long description body.",
  })
  const draft = extractFromDocument(doc, "https://boards.greenhouse.io/figma/jobs/1", "")

  assert.equal(draft.companyName, "Figma")
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
  assert.equal(sourcePlatformFromUrl("https://start.mopid.me/jobapply/?jobId=687-f96ba"), "mopid")
  assert.equal(sourcePlatformFromUrl("https://example.com/jobs/1"), "generic")
})

test("enriches a MOPID capture from its public job endpoint", async () => {
  const draft = {
    sourceUrl: "https://start.mopid.me/jobapply/?jobId=687-f96ba&source=job-board",
    sourcePlatform: "mopid",
    captureMethod: "visible_page",
    confidence: 0.42,
    roleName: "Sales Manager - Real Estate AI SaaS",
    companyName: "Huvo AI",
    location: "Gurugram",
    jobDescription: "Application form fields only.",
    fieldSources: { role: "known_portal", company: "known_portal", location: "known_portal", jobDescription: "visible_page" },
    needsBackstop: false,
  }
  let requestedUrl = ""
  const enriched = await enrichMopidPortalDraft(draft, async (url) => {
    requestedUrl = url
    return {
      ok: true,
      json: async () => ({
        status: 200,
        data: {
          job_name: "Sales Manager - Real Estate AI SaaS",
          company_name: "Huvo AI",
          job_location: "Gurugram",
          job_description: "<p>Own the full sales cycle with <b>real estate</b> customers.</p>",
        },
      }),
    }
  })

  assert.equal(mopidJobIdFromUrl(draft.sourceUrl), "687-f96ba")
  assert.equal(requestedUrl, "https://ats.mopid.me/api/v1.0/job?job_uuid=687-f96ba")
  assert.equal(enriched.captureMethod, "known_portal")
  assert.equal(enriched.jobDescription, "Own the full sales cycle with real estate customers.")
  assert.equal(enriched.fieldSources.jobDescription, "known_portal")
})

test("preserves selected MOPID text while enriching structured fields", async () => {
  const draft = {
    sourceUrl: "https://start.mopid.me/jobapply/?jobId=687-f96ba",
    sourcePlatform: "mopid",
    captureMethod: "selected_text",
    confidence: 0.7,
    roleName: null,
    companyName: null,
    location: null,
    jobDescription: "Candidate-selected description with extra context.",
    fieldSources: { role: null, company: null, location: null, jobDescription: "selected_text" },
    needsBackstop: true,
  }
  const enriched = await enrichMopidPortalDraft(draft, async () => ({
    ok: true,
    json: async () => ({ status: 200, data: { job_name: "Sales Manager", company_name: "Huvo AI", job_location: "Gurugram", job_description: "Endpoint text" } }),
  }))

  assert.equal(enriched.jobDescription, draft.jobDescription)
  assert.equal(enriched.captureMethod, "selected_text")
  assert.equal(enriched.roleName, "Sales Manager")
  assert.equal(enriched.needsBackstop, false)
})
