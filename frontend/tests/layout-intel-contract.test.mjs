import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = join(__dirname, "..")

function read(relativePath) {
  return readFileSync(join(frontendRoot, relativePath), "utf8")
}

test("intel section wrapper uses growable height to avoid overlap", () => {
  const source = read("app/intel/page.tsx")
  const intelBlockMatch = source.match(/<div style=\{\{ flex: 1,[\s\S]*?<IntelPane \/>/)

  assert.ok(intelBlockMatch, "intel wrapper block should exist in app/intel/page.tsx")

  const intelBlock = intelBlockMatch[0]
  assert.match(intelBlock, /flex:\s*1/)
  assert.match(intelBlock, /overflowY:\s*"auto"/)
  assert.doesNotMatch(intelBlock, /\bheight:\s*"100dvh"/)
})

test("intel job fit drawer preserves role intent", () => {
  const paneSource = read("components/public/intel-pane.tsx")
  const resultsSource = read("components/public/intel/intel-results.tsx")
  const rowsSource = read("components/public/intel/intel-rows.tsx")
  const drawerSource = read("components/public/intel/job-fit-drawer.tsx")

  assert.ok(paneSource.includes("JobFitDrawer"))
  assert.ok(resultsSource.includes("onCheckFit"))
  assert.ok(rowsSource.includes("onCheckFit"))
  assert.ok(drawerSource.includes("Save + tailor CV"))
  assert.ok(drawerSource.includes("public_fit_preview"))
  assert.ok(drawerSource.includes("jobFitNextPath"))
})

test("cv upload claim keeps job id after auth handoff", () => {
  const source = read("app/(authed)/cv/page.tsx")
  assert.ok(source.includes('searchParams.get("jobId")'))
  assert.ok(source.includes("uploadJobId"))
  assert.ok(source.includes('`/cv?jobId=${encodeURIComponent(uploadJobId)}`'))
})
