import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

const source = fs.readFileSync(
  path.join(process.cwd(), "components/jobs/card-detail-rail.tsx"),
  "utf8",
)

test("full JD is fetched only after the user opens the JD disclosure", () => {
  assert.match(source, /\{tab === "jd" \? <JdPanel/)
  assert.match(source, /const needsFull = !summary && !!job\.job_description_truncated/)
  assert.match(source, /enabled: !!token && needsFull/)
  assert.match(source, /const text = summary \|\| full\.data\?\.job_description\?\.trim\(\) \|\| snippet/)
  assert.match(source, /Loading the rest…/)
})
