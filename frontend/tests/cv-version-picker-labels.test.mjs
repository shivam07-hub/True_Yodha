import test from "node:test"
import assert from "node:assert/strict"

const versionPicker = await import("../components/cv/version-picker.tsx")
const helpers = versionPicker.formatJobVersionLabel ? versionPicker : versionPicker.default

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
}

const jobVersions = [autodeskV2, autodeskV1]
const allVersions = [autodeskV2, autodeskV1, sanofiVersion, baseline]

test("job version labels are local to the current job history", () => {
  assert.equal(helpers.formatJobVersionLabel(autodeskV1, jobVersions), "Job v1")
  assert.equal(helpers.formatJobVersionLabel(autodeskV2, jobVersions), "Job v2")
})

test("global CV version is still available as metadata", () => {
  assert.equal(helpers.formatGlobalVersionLabel(autodeskV2), "CV v16")
})

test("parent labels resolve baseline parents outside the job-scoped list", () => {
  assert.equal(
    helpers.formatParentVersionLabel(autodeskV2.parent_version_id, jobVersions, allVersions),
    "baseline v2",
  )
})

test("parent labels prefer job-local names when the parent belongs to this job", () => {
  assert.equal(
    helpers.formatParentVersionLabel(autodeskV1.id, jobVersions, allVersions),
    "Job v1",
  )
})
