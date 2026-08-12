import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()
const read = (path) => readFileSync(join(frontendRoot, path), "utf8")

const genericCanvasOwners = [
  "app/companies/layout.tsx",
  "app/intel/page.tsx",
  "app/newsletter/layout.tsx",
  "app/privacy/page.tsx",
  "app/security/page.tsx",
  "app/taxonomy/page.tsx",
  "app/terms/page.tsx",
  "components/app-shell.tsx",
  "components/auth/auth-page-shell.tsx",
  "components/companies/company-jobs-client.tsx",
  "components/docs/docs-page.tsx",
  "components/errors/app-route-error.tsx",
  "components/loading/route-loading/route-loading.flow-step.tsx",
  "components/loading/route-loading/skeleton-mirrors/app-shell-skeleton.tsx",
  "components/loading/route-loading/skeleton-mirrors/cv-baseline-skeleton.tsx",
  "components/loading/route-loading/skeleton-mirrors/cv-playground-skeleton.tsx",
  "mobile/shell.tsx",
]

test("the canonical page canvas exposes the dark deep-field and keeps light mode plain", () => {
  const tokens = read("app/design-tokens.css")

  assert.match(tokens, /body::before\s*\{[\s\S]*background-image:/)
  assert.match(tokens, /:root\[data-surface="light"\] body::before\s*\{\s*display:\s*none;/)
  assert.match(tokens, /\.tm-page-canvas\s*\{\s*background:\s*transparent;/)
})

test("generic full-page shells use the transparent canvas contract", () => {
  for (const path of genericCanvasOwners) {
    const source = read(path)
    assert.match(source, /tm-page-canvas/, `${path} must expose the canonical page canvas`)
  }
})

test("landing blank space and mobile scrolling do not repaint the page", () => {
  const landing = read("components/public/landing/landing-base.css")
  const companyRail = read("components/public/landing/landing-company-rail.css")
  const globals = read("app/globals.css")

  assert.match(landing, /\.tm-landing\s*\{[\s\S]*?background:\s*transparent;/)
  assert.match(companyRail, /\.lp-company-rail\s*\{[\s\S]*?background:\s*transparent;/)
  assert.match(globals, /\.tm-main-scroll\s*\{[\s\S]*?background:\s*transparent;/)
})

test("purpose-built visual islands retain their own canvases", () => {
  const myrology = read("app/myrology/myrology.css")
  const enterprise = read("app/signup/institutions/enterprise-signup.css")
  const b2b = read("components/public/b2b-door-page.css")
  const engine = read("components/public/landing/landing-engine.css")

  assert.match(myrology, /\.myrology-root\s*\{[\s\S]*?background:\s*var\(--tm-bg\);/)
  assert.match(enterprise, /\.es-page\s*\{[\s\S]*?background:\s*var\(--tm-bg\);/)
  assert.match(b2b, /\.tm-b2b-page\s*\{[\s\S]*?radial-gradient/)
  assert.match(engine, /\.lp-engine,[\s\S]*?\.lp-readout\s*\{[\s\S]*?background:\s*var\(--lp-bg\);/)
})

test("public dark chrome frosts over the same field", () => {
  const publicNav = read("components/public/public-nav.css")

  assert.match(publicNav, /:root:not\(\[data-surface="light"\]\) \.tm-public-nav/)
  assert.match(publicNav, /background:\s*color-mix\(in srgb, var\(--tm-bg\) 76%, transparent\)/)
})
