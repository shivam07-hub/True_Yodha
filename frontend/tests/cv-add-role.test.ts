/**
 * #58 S5 / #61 S5 — a role or project can be added on the desktop paper, and a
 * phone edit of a tailored CV writes that CV.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

import type { CVStructured } from "../lib/api"
import { showProjectsSection, withAddedProject, withAddedRole } from "../lib/cv/add-entry"
import { writeOpenDocument } from "../lib/cv/open-document"

function cv(partial: Partial<CVStructured> = {}): CVStructured {
  return {
    summary: "Ops lead.",
    education: [],
    experience: [
      { company: "Acme", role: "Analyst", dates: "2020–2023", location: "Pune", bullets: ["Built the model"] },
    ],
    projects: [],
    skills_line: "SQL",
    certs: [],
    ...partial,
  }
}

test("adding a role appends a blank role and keeps the ones already there", () => {
  const next = withAddedRole(cv())
  assert.equal(next.experience.length, 2)
  assert.equal(next.experience[0].role, "Analyst")
  assert.equal(next.experience[1].role, "")
  assert.equal(next.experience[1].company, "")
  assert.deepEqual(next.experience[1].bullets, [""])
  assert.equal(cv().experience.length, 1)
})

test("adding a project appends a blank project", () => {
  const next = withAddedProject(cv())
  assert.equal(next.projects.length, 1)
  assert.equal(next.projects[0].name, "")
  assert.deepEqual(next.projects[0].bullets, [""])
})

test("an empty projects section is shown when the paper can be edited", () => {
  assert.equal(showProjectsSection(0, true, false), true)
  assert.equal(showProjectsSection(0, false, true), true)
  assert.equal(showProjectsSection(0, false, false), false)
  assert.equal(showProjectsSection(2, false, false), true)
})

test("a phone edit that adds a role lands on the tailored CV and leaves the master untouched", async () => {
  const tailored = cv()
  const next = withAddedRole(tailored)
  const masterWrites: CVStructured[] = []
  const jobWrites: CVStructured[] = []
  await writeOpenDocument("job", next, {
    saveMaster: async (doc) => { masterWrites.push(doc) },
    saveJob: async (doc) => { jobWrites.push(doc) },
  })
  assert.equal(masterWrites.length, 0)
  assert.equal(jobWrites.length, 1)
  assert.equal(jobWrites[0].experience.length, 2)
  assert.equal(jobWrites[0].experience[0].company, "Acme")
  assert.equal(jobWrites[0].experience[1].role, "")
})

test("new material on the master still writes the master", async () => {
  let master = 0
  let job = 0
  await writeOpenDocument("master", cv(), {
    saveMaster: async () => { master += 1 },
    saveJob: async () => { job += 1 },
  })
  assert.equal(master, 1)
  assert.equal(job, 0)
})

test("the desktop job paper writes an added role onto that job document", () => {
  const playground = readFileSync(new URL("../components/cv/builder/playground-view.tsx", import.meta.url), "utf8")
  const paper = readFileSync(new URL("../components/cv/builder/cv-paper-sections.tsx", import.meta.url), "utf8")
  assert.match(paper, /Add role/)
  assert.match(paper, /Add project/)
  assert.match(paper, /a role you held/)
  assert.match(paper, /something you built/)
  assert.match(paper, /withAddedRole/)
  assert.match(paper, /withAddedProject/)
  assert.doesNotMatch(paper, /projects\.length === 0\) return null/)
  const document = readFileSync(new URL("../components/cv/builder/cv-document.tsx", import.meta.url), "utf8")
  assert.match(document, /showProjectsSection/)
  assert.match(playground, /onPatch=\{patchBoth\}/)
  const both = playground.slice(playground.indexOf("function patchBoth"), playground.indexOf("function confirmApply"))
  assert.match(both, /patchJobCv\(mut\)/)
  assert.match(both, /patchMaster\.mutate\(mut\)/)
})

test("the phone editor for a tailored CV does not autosave the master", () => {
  const editor = readFileSync(new URL("../components/cv/mobile/mobile-main-editor.tsx", import.meta.url), "utf8")
  const job = editor.slice(editor.indexOf("function MobileJobEditor"), editor.indexOf("function MobileMasterEditor"))
  assert.match(job, /useJobDraftAutosave/)
  assert.doesNotMatch(job, /useMasterAutosave/)
  const hook = readFileSync(new URL("../lib/hooks/use-job-draft-autosave.ts", import.meta.url), "utf8")
  assert.match(hook, /writeOpenDocument\(\s*"job"/)
  assert.doesNotMatch(hook, /cv\.saveMaster|useMasterAutosave/)
  const page = readFileSync(new URL("../app/(authed)/cv/page.tsx", import.meta.url), "utf8")
  assert.match(page, /save: playground\.saveJobCv/)
})
