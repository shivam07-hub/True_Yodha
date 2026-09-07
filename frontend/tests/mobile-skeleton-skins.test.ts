/**
 * Phone loading is one skin, matching the live mobile page.
 *
 * The desktop workspace skeletons (248px rail + 320px peek) used to paint on
 * a 375px screen as stacked columns — a "double or triple" load — then the
 * real Jobs/Collections/CV surface mounted a second, different skeleton.
 * CSS (skeleton-skins.css) shows only the matching skin; the live surfaces
 * reuse the same feed-row placeholders so the handoff is a fill, not a relayout.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const ROOT = join(__dirname, "..")
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8")
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

test("CSS shows only one skeleton skin at a time", () => {
  const css = read("components/loading/skeleton-skins.css")
  assert.match(css, /\.tm-skel-skin--mobile\s*\{\s*display:\s*none/)
  assert.match(css, /@media \(max-width:\s*768px\)/)
  assert.match(css, /\.tm-skel-skin--desktop\s*\{\s*display:\s*none/)
  assert.match(css, /\.tm-skel-skin--mobile\s*\{\s*display:\s*block/)
})

test("each authed tab skeleton pairs a desktop skin with the live phone surface", () => {
  const page = code("components/loading/page-skeletons.tsx")
  assert.match(page, /MarketSkeleton[\s\S]*JobsMobileSkeleton/)
  assert.match(page, /DashboardSkeleton[\s\S]*CollectionsMobileSkeleton/)
  assert.match(page, /PracticeSkeleton[\s\S]*PracticeMobileSkeleton/)
  assert.match(page, /CVRouteSkeleton/)
})

test("Jobs and Collections surfaces reuse the route skeleton's feed rows", () => {
  const jobs = code("mobile/redesign/jobs-surface.tsx")
  const collections = code("mobile/redesign/collections-surface.tsx")
  assert.match(jobs, /<JobsMobileFeedRows\s*\/>/)
  assert.doesNotMatch(jobs, /mm-stepPulse/)
  assert.match(collections, /<CollectionsMobileFeedRows\s*\/>/)
})

test("CV route mirrors paint the phone hub / workstation, not only the desktop split", () => {
  const baseline = code("components/loading/route-loading/skeleton-mirrors/cv-baseline-skeleton.tsx")
  const station = code("components/loading/route-loading/skeleton-mirrors/cv-workstation-skeleton.tsx")
  assert.match(baseline, /<CVMobileHubSkeleton\s*\/>/)
  assert.match(station, /<CVMobileWorkstationSkeleton\s*\/>/)
})

test("AppShell bootstrap is chrome + one page skeleton, not a second stacked page", () => {
  const shell = code("components/app-shell.tsx")
  const chrome = code("mobile/shell.tsx")
  assert.match(shell, /<AppShellSkeleton>\{skeletonForPath\(pathname\)\}<\/AppShellSkeleton>/)
  assert.match(chrome, /export function AppShellSkeleton\(\{ children/)
  assert.match(chrome, /\{children\}/)
  assert.doesNotMatch(chrome, /react-loading-skeleton/)
})
