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
  // `<IntelPane />` became `<IntelSurface />` when /intel was session-branched
  // (anon SEO pane vs authed workspace). The overlap contract this guards —
  // the scroll container grows instead of being pinned to 100dvh — is unchanged.
  const intelBlockMatch = source.match(/<div style=\{\{ flex: 1,[\s\S]*?<IntelSurface \/>/)

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

test("intel console is backed by tracked companies, not fake URL seeds", () => {
  const heroSource = read("components/public/intel/intel-hero.tsx")
  const paneSource = read("components/public/intel-pane.tsx")
  const dataSource = read("components/public/intel/intel-data.ts")

  assert.ok(heroSource.includes("buildConsoleSeeds"))
  assert.ok(heroSource.includes("RUNNER_MODEL_LABELS"))
  assert.ok(paneSource.includes("consoleCompanies={analytics?.by_company ?? []}"))
  assert.doesNotMatch(dataSource, /LOG_SEEDS/)
  assert.doesNotMatch(heroSource, /Last commit/)
  assert.doesNotMatch(heroSource, /gpt-oss-120b/)
})

test("landing and intel search use the shared public search console", () => {
  const landingSource = read("components/public/landing/job-search.tsx")
  const paneSource = read("components/public/intel-pane.tsx")

  assert.ok(landingSource.includes("JobSearchConsole"))
  assert.ok(landingSource.includes("buildIntelSearchHref"))
  assert.doesNotMatch(landingSource, /publicCv\.searchJobs/)

  assert.ok(paneSource.includes("JobSearchConsole"))
  assert.ok(paneSource.includes("useSearchParams"))
  assert.ok(paneSource.includes("initialJobSearchValue(searchParams)"))
})
