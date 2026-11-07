import test from "node:test"
import assert from "node:assert/strict"

import type { CVVersion } from "../lib/api"
import { cvOfRecordFor } from "../lib/cv/workspace"

function v(partial: Partial<CVVersion>): CVVersion {
  return { id: 1, kind: "baseline_upload", job_id: null, user_version_number: 1, title: null, created_at: "2026-11-01T00:00:00Z", ...partial } as CVVersion
}

test("the CV tailored for this job is the one that goes", () => {
  const tailored = v({ id: 2, kind: "tailored", job_id: "myro_1", title: "Product CV", created_at: "2026-10-01T00:00:00Z" })
  const newer = v({ id: 3, created_at: "2026-11-05T00:00:00Z" })
  assert.equal(cvOfRecordFor("myro_1", [newer, tailored])?.id, 2)
})

test("with nothing tailored, the newest CV goes, as the backend freezes it", () => {
  const older = v({ id: 1, created_at: "2026-10-01T00:00:00Z" })
  const newer = v({ id: 3, created_at: "2026-11-05T00:00:00Z" })
  assert.equal(cvOfRecordFor("myro_9", [older, newer])?.id, 3)
})

test("no CV means nothing goes", () => {
  assert.equal(cvOfRecordFor("myro_1", []), null)
})
