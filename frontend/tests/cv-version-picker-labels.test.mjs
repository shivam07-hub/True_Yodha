import test from "node:test"
import assert from "node:assert/strict"

const versionPicker = await import("../components/cv/version-picker.tsx")
const helpers = versionPicker.formatThreadVersionLabel ? versionPicker : versionPicker.default

const baseline = {
  id: 4,
  user_version_number: 2,
  kind: "baseline_upload",
  job_id: null,
  parent_version_id: null,
  baseline_version_id: null,
  title: "Uploaded baseline CV",
  hidden_items: [],
  edited_items: {},
  body_text: "",
  polished_text: null,
  ai_polished: false,
  created_at: "2026-05-18T13:00:00Z",
}

const autodeskV1 = {
  ...baseline,
  id: 24,
  user_version_number: 15,
  kind: "deterministic",
  job_id: "autodesk-workplace-events-lead",
  job_title: "Workplace Events Lead",
  company_name: "Autodesk",
  parent_version_id: 4,
  baseline_version_id: 4,
  hidden_items: ["summary:a"],
  created_at: "2026-05-18T13:39:00Z",
}

const autodeskV2 = {
  ...autodeskV1,
  id: 25,
  user_version_number: 16,
  hidden_items: ["summary:a", "exp:b"],
  created_at: "2026-05-18T13:40:00Z",
}

const sanofiVersion = {
  ...autodeskV1,
  id: 23,
  user_version_number: 14,
  job_id: "sanofi-project-manager",
  job_title: "Head of Internal Stakeholder and Project Management",
  company_name: "Sanofi",
}

const companyVersions = [baseline, autodeskV2, autodeskV1]
const allVersions = [autodeskV2, autodeskV1, sanofiVersion, baseline]

test("thread labels expose the master CV and job-local tailored CV copies", () => {
  assert.equal(helpers.formatThreadVersionLabel(baseline, companyVersions), "Master CV")
  assert.equal(helpers.formatThreadVersionLabel(autodeskV1, companyVersions), "Tailored copy 1")
  assert.equal(helpers.formatThreadVersionLabel(autodeskV2, companyVersions), "Tailored copy 2")
})

test("global saved-copy label is still available as metadata", () => {
  assert.equal(helpers.formatGlobalVersionLabel(autodeskV2), "Copy 16")
})

test("parent labels resolve baseline parents outside the job-scoped list", () => {
  assert.equal(
    helpers.formatParentVersionLabel(autodeskV2.parent_version_id, companyVersions, allVersions),
    "Master CV",
  )
})

test("parent labels prefer tailored CV names when the parent belongs to this job", () => {
  assert.equal(
    helpers.formatParentVersionLabel(autodeskV1.id, companyVersions, allVersions),
    "Tailored copy 1",
  )
})

test("copy subtitles name the job behind a tailored CV", () => {
  assert.equal(
    helpers.formatVersionContext(autodeskV2),
    "Workplace Events Lead · Autodesk",
  )
  assert.equal(helpers.formatVersionContext(baseline), "Main CV")
})
