import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  createJobImport,
  reviewGap,
  type JobImportClient,
  type JobImportState,
} from "../lib/job-import/use-job-import"

function client(overrides: Partial<JobImportClient> = {}): JobImportClient & {
  imported: Array<Parameters<JobImportClient["importJob"]>[0]>
} {
  const imported: Array<Parameters<JobImportClient["importJob"]>[0]> = []
  return {
    imported,
    extractUrl: async () => ({
      role: "Page tagline",
      company: "Acme",
      location: "Bengaluru",
      job_description: "Own the payments roadmap.",
    }),
    extractFile: async () => ({
      role: "From a file",
      company: "Acme",
      location: "",
      job_description: "The posting text.",
    }),
    extractText: async () => ({
      role: "Sales Manager",
      company: "Swiggy",
      location: "Bengaluru",
      job_description: "A shorter rewrite of the posting.",
    }),
    importJob: async (body) => {
      imported.push(body)
      return { job_id: "ext_1", coin_balance: 20 }
    },
    ...overrides,
  }
}

async function settle(importer: ReturnType<typeof createJobImport>, run: () => Promise<void>) {
  const seen: JobImportState["step"][] = []
  const stop = importer.subscribe(() => seen.push(importer.getState().step))
  await run()
  stop()
  return seen
}

test("a link is reviewed before it is imported, and an edit replaces the extracted role", async () => {
  const api = client()
  const balances: number[] = []
  const importer = createJobImport(api, { onBalance: (n) => balances.push(n) })

  const steps = await settle(importer, () => importer.submitLink("https://jobs.example/pm"))
  assert.deepEqual(steps, ["extracting", "review"])
  const review = importer.getState()
  assert.equal(review.step, "review")
  if (review.step !== "review") return
  assert.equal(review.role, "Page tagline")
  assert.equal(review.company, "Acme")
  assert.equal(review.jd, "Own the payments roadmap.")

  importer.updateReview({ role: "Product Manager" })
  await importer.confirm()

  const done = importer.getState()
  assert.equal(done.step, "imported")
  if (done.step !== "imported") return
  assert.equal(done.jobId, "ext_1")
  assert.equal(done.tailorHref, "/cv?jobId=ext_1")
  assert.equal(api.imported.length, 1)
  assert.equal(api.imported[0].role_name, "Product Manager")
  assert.equal(api.imported[0].company_name, "Acme")
  assert.equal(api.imported[0].job_description, "Own the payments roadmap.")
  assert.equal(api.imported[0].source_url, "https://jobs.example/pm")
  assert.deepEqual(balances, [20])
})

test("a link that cannot be read opens the box straight away and keeps the link", async () => {
  const api = client({
    extractUrl: async () => {
      throw new Error("LinkedIn won't let Myro read its pages.")
    },
  })
  const importer = createJobImport(api)

  await importer.submitLink("https://www.linkedin.com/jobs/view/1/")
  assert.deepEqual(importer.getState(), {
    step: "pasting",
    text: "",
    reason: "LinkedIn won't let Myro read its pages.",
  })

  importer.updatePaste("Sales Manager at Swiggy. Own the city's revenue.")
  await importer.submitText()
  await importer.confirm()

  assert.equal(api.imported[0].source_url, "https://www.linkedin.com/jobs/view/1/")
})

test("pasted text fills the role and company, and the person's own words stay the description", async () => {
  const api = client()
  const importer = createJobImport(api)
  importer.pasteInstead()
  assert.deepEqual(importer.getState(), { step: "pasting", text: "", reason: null })

  importer.updatePaste("  Sales Manager at Swiggy. Own the city's revenue.  ")
  const steps = await settle(importer, () => importer.submitText())

  assert.deepEqual(steps, ["extracting", "review"])
  const review = importer.getState()
  assert.equal(review.step, "review")
  if (review.step !== "review") return
  assert.equal(review.role, "Sales Manager")
  assert.equal(review.company, "Swiggy")
  assert.equal(review.location, "Bengaluru")
  assert.equal(review.jd, "Sales Manager at Swiggy. Own the city's revenue.")
})

test("a read that fails keeps what they pasted and asks for the role", async () => {
  const api = client({
    extractText: async () => {
      throw new Error("The parser is busy right now.")
    },
  })
  const importer = createJobImport(api)
  importer.pasteInstead()
  importer.updatePaste("Sales Manager at Swiggy. Own the city's revenue.")
  await importer.submitText()

  const review = importer.getState()
  assert.equal(review.step, "review")
  if (review.step !== "review") return
  assert.equal(review.jd, "Sales Manager at Swiggy. Own the city's revenue.")
  assert.equal(review.role, "")
  assert.equal(reviewGap(review), "Add the role")
})

test("an empty box reads nothing", async () => {
  let calls = 0
  const importer = createJobImport(client({
    extractText: async () => {
      calls += 1
      return { role: "", company: "", location: "", job_description: "" }
    },
  }))
  importer.pasteInstead()
  importer.updatePaste("   ")
  await importer.submitText()

  assert.equal(calls, 0)
  assert.equal(importer.getState().step, "pasting")
})

test("the button names what is missing, and nothing once it is whole", () => {
  assert.equal(reviewGap({ role: " ", jd: "Own it." }), "Add the role")
  assert.equal(reviewGap({ role: "Sales Manager", jd: " " }), "Add the description")
  assert.equal(reviewGap({ role: "", jd: "" }), "Add the role")
  assert.equal(reviewGap({ role: "Sales Manager", jd: "Own it." }), null)
})

test("every surface opens the same box and names what is missing", () => {
  for (const path of [
    "../components/job-import/job-import-dialog.tsx",
    "../mobile/redesign/add-job-sheet.tsx",
    "../components/onboarding/job-choice.tsx",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8")
    assert.match(source, /state\.step === "pasting"/, path)
    assert.match(source, /importJob\.submitText/, path)
    assert.match(source, /reviewGap\(/, path)
  }
})

test("pasted text is read by a model, so it waits as long as the model does", () => {
  const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8")
  const start = api.indexOf("extractText: (token: string, text: string)")
  assert.ok(start > 0, "extractText moved — point this test at it")
  const block = api.slice(start, api.indexOf("\n    }),", start))
  assert.match(block, /timeoutMs: LLM_REQUEST_TIMEOUT_MS/)
})

test("both skins render the model and do not fetch", () => {
  const dialog = readFileSync(new URL("../components/job-import/job-import-dialog.tsx", import.meta.url), "utf8")
  const sheet = readFileSync(new URL("../mobile/redesign/add-job-sheet.tsx", import.meta.url), "utf8")
  for (const source of [dialog, sheet]) {
    assert.match(source, /useJobImport/)
    assert.doesNotMatch(source, /extractUrl|importJob\(|importPreview|extractFile/)
  }
  assert.throws(() => readFileSync(new URL("../components/cv/pipeline/ManualAddModal.tsx", import.meta.url), "utf8"))
})

test("a failed save is not a paste-instead, and retry returns to the same review", async () => {
  let calls = 0
  const api = client({
    importJob: async () => {
      calls += 1
      if (calls === 1) throw new Error("Couldn't save that.")
      return { job_id: "ext_2", coin_balance: null }
    },
  })
  const importer = createJobImport(api)
  await importer.submitLink("https://jobs.example/pm")
  importer.updateReview({ role: "Product Manager" })
  await importer.confirm()
  assert.deepEqual(importer.getState(), {
    step: "failed",
    reason: "Couldn't save that.",
    canPasteInstead: false,
  })
  importer.pasteInstead()
  assert.equal(importer.getState().step, "failed")
  importer.retry()
  const review = importer.getState()
  assert.equal(review.step, "review")
  if (review.step !== "review") return
  assert.equal(review.role, "Product Manager")
})

test("a link is read by a model, so it waits as long as the model does", () => {
  // The server fetches the page and an LLM rewrites the whole posting: 31s on
  // dev for an amazon.jobs link (2026-10-19). On the 15s default the door said
  // "Request timed out." while the server answered 200 into the void.
  const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8")
  const start = api.indexOf("extractUrl: (token: string, url: string)")
  assert.ok(start > 0, "extractUrl moved — point this test at it")
  const block = api.slice(start, api.indexOf("\n    }),", start))
  assert.match(block, /timeoutMs: LLM_REQUEST_TIMEOUT_MS/)
})

test("a link that is a listing Myro holds is that listing, read-only, saved by id", async () => {
  const api = client({
    extractUrl: async () => ({
      role: "Business Analyst",
      company: "Kotak Mahindra Bank",
      location: "Mumbai",
      job_description: "Own the digital banking analytics.",
      listing_job_id: "270652",
    }),
  })
  const importer = createJobImport(api)
  await importer.submitLink("https://hcbt.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/270652")
  const review = importer.getState()
  assert.equal(review.step, "review")
  if (review.step !== "review") return
  assert.equal(review.listing, true)
  importer.updateReview({ role: "Something else" })
  const still = importer.getState()
  assert.equal(still.step === "review" && still.role, "Business Analyst", "a listing's fields are the listing's")
  await importer.confirm()
  assert.equal(api.imported[0].listing_job_id, "270652")
})

test("a link Myro does not hold reviews and imports as before", async () => {
  const api = client()
  const importer = createJobImport(api)
  await importer.submitLink("https://jobs.example/pm")
  const review = importer.getState()
  assert.equal(review.step === "review" && review.listing, false)
  await importer.confirm()
  assert.equal(api.imported[0].listing_job_id, null)
})
