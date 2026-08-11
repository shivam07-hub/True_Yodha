import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveCompaniesDirectoryState,
  type DirectoryCompany,
} from "../lib/companies/directory-state"

const COMPANY: DirectoryCompany = {
  name: "Acme",
  count: 3,
  industry: null,
}

test("an unavailable server read stays loading while its automatic retry runs", () => {
  assert.deepEqual(
    resolveCompaniesDirectoryState({
      initialStatus: "unavailable",
      initialCompanies: [],
      recovery: undefined,
      isRecovering: true,
      recoveryFailed: false,
    }),
    { kind: "loading" },
  )
})

test("a failed recovery remains unavailable rather than becoming an empty directory", () => {
  assert.deepEqual(
    resolveCompaniesDirectoryState({
      initialStatus: "unavailable",
      initialCompanies: [],
      recovery: undefined,
      isRecovering: false,
      recoveryFailed: true,
    }),
    { kind: "unavailable" },
  )
})

test("a successful zero-company response is the only empty-directory state", () => {
  assert.deepEqual(
    resolveCompaniesDirectoryState({
      initialStatus: "ready",
      initialCompanies: [],
      recovery: undefined,
      isRecovering: false,
      recoveryFailed: false,
    }),
    { kind: "empty" },
  )
})

test("a successful retry restores the company rows without waiting for a reload", () => {
  assert.deepEqual(
    resolveCompaniesDirectoryState({
      initialStatus: "unavailable",
      initialCompanies: [],
      recovery: { status: "ready", companies: [{ name: "Acme", active_count: 3 }] },
      isRecovering: false,
      recoveryFailed: false,
    }),
    { kind: "ready", companies: [COMPANY] },
  )
})
