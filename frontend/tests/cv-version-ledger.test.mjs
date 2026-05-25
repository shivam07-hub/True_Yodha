import test from "node:test"
import assert from "node:assert/strict"

const ledger = await import("../components/cv/version-ledger.tsx")
const helpers = ledger.summarizeCVVersionLedger ? ledger : ledger.default

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
  body_text: "MASTER CV TEXT",
  polished_text: null,
  ai_polished: false,
  created_at: "2026-05-18T13:00:00Z",
  job_title: null,
  company_name: null,
}

const legacyBaseline = {
  ...baseline,
  id: 3,
  user_version_number: 1,
  body_text: "",
  created_at: "2026-04-18T13:00:00Z",
}

const autodeskVersion = {
  ...baseline,
  id: 25,
  user_version_number: 16,
  kind: "deterministic",
  job_id: "autodesk-workplace-events-lead",
  job_title: "Workplace Events Lead",
  company_name: "Autodesk",
  parent_version_id: 4,
  baseline_version_id: 4,
  hidden_items: ["summary:a", "exp:b"],
  body_text: "AUTODESK CV TEXT",
  created_at: "2026-05-18T13:40:00Z",
}

const sanofiVersion = {
  ...autodeskVersion,
  id: 23,
  user_version_number: 14,
  job_id: "sanofi-project-manager",
  job_title: "Head of Internal Stakeholder and Project Management",
  company_name: "Sanofi",
  body_text: "SANOFI BASE TEXT",
  polished_text: "SANOFI POLISHED TEXT",
  kind: "polished",
}

const versions = [autodeskVersion, sanofiVersion, baseline, legacyBaseline]

test("/cv ledger counts every visible saved CV", () => {
  assert.deepEqual(helpers.summarizeCVVersionLedger(versions), {
    totalVersions: 4,
    masterVersions: 2,
    companyVersions: 2,
    companyCount: 2,
    jobCount: 2,
  })
})

test("/cv ledger uses global saved-copy names and library-friendly context", () => {
  assert.equal(helpers.formatLedgerVersionName(autodeskVersion), "Copy 16")
  assert.equal(helpers.formatLedgerVersionKind(autodeskVersion), "Tailored CV")
  assert.equal(helpers.formatLedgerVersionName(baseline), "Master CV")
  assert.equal(helpers.formatLedgerVersionKind(baseline), "Main CV")
  assert.equal(helpers.formatLedgerVersionContext(autodeskVersion), "Workplace Events Lead · Autodesk")
})

test("/cv ledger previews the clicked version text", () => {
  assert.equal(helpers.getLedgerPreviewText(baseline, "RENDERED MASTER CV"), "RENDERED MASTER CV")
  assert.equal(helpers.getLedgerPreviewText(autodeskVersion, "RENDERED MASTER CV"), "AUTODESK CV TEXT")
  assert.equal(helpers.getLedgerPreviewText(sanofiVersion, "RENDERED MASTER CV"), "SANOFI POLISHED TEXT")
  assert.equal(helpers.getLedgerPreviewText(null, "RENDERED MASTER CV"), "RENDERED MASTER CV")
})
