/**
 * The phone lab is a 375×812 iframe of the real chrome + route skeleton
 * (or the live authed tab). It 404s in production. qa:mobile stays the
 * assert gate and does not walk /dev.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const ROOT = join(__dirname, "..")
const REPO = join(ROOT, "..")
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8")
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

test("production never serves /dev", () => {
  const mw = code("middleware.ts")
  assert.match(mw, /production && path\.startsWith\("\/dev"\)/)
  assert.match(mw, /status: 404/)
  assert.match(code("app/dev/phone/page.tsx"), /notFound\(\)/)
  assert.match(code("app/dev/phone/frame/page.tsx"), /notFound\(\)/)
  assert.match(code("app/dev/qa-session/route.ts"), /NODE_ENV === "production"/)
  assert.match(code("app/dev/qa-session/route.ts"), /status: 404/)
})

test("dev framing is same-origin only, production stays none", () => {
  const mw = read("middleware.ts")
  assert.match(mw, /if \(!production\)/)
  assert.match(mw, /frame-ancestors 'self'/)
  assert.match(mw, /X-Frame-Options/)
  const policy = read("lib/security-policy.ts")
  assert.match(policy, /frame-ancestors 'none'/)
  assert.match(policy, /"X-Frame-Options": "DENY"/)
  const nextConfig = read("next.config.mjs")
  assert.match(nextConfig, /NODE_ENV === "production"/)
  assert.match(nextConfig, /SAMEORIGIN/)
  assert.match(nextConfig, /production \? "DENY" : "SAMEORIGIN"/)
})

test("the lab iframe is the qa:mobile handset", () => {
  const lab = code("lib/dev/phone-lab.ts")
  const ui = code("components/dev/phone-lab.tsx")
  assert.match(lab, /PHONE_LAB_WIDTH = 375/)
  assert.match(lab, /PHONE_LAB_HEIGHT = 812/)
  assert.match(ui, /title="Handset"/)
  assert.match(ui, /width=\{PHONE_LAB_WIDTH\}/)
  assert.match(ui, /height=\{PHONE_LAB_HEIGHT\}/)
  assert.match(ui, /\/dev\/phone\/frame/)
})

test("Load mode is chrome plus the same skeletons the routes paint", () => {
  const frame = code("components/dev/phone-frame-body.tsx")
  assert.match(frame, /<AppShellSkeleton>/)
  assert.match(frame, /skeletonForPath\(/)
  assert.match(frame, /<CVWorkstationSkeleton\s*\/>/)
  const tabs = code("lib/dev/phone-lab.ts")
  assert.match(tabs, /path: "\/market"/)
  assert.match(tabs, /path: "\/collections"/)
  assert.match(tabs, /path: "\/cv"/)
  assert.match(tabs, /path: "\/preparations"/)
})

test("QA credentials never leave the server route", () => {
  const ui = read("components/dev/phone-lab.tsx")
  assert.doesNotMatch(ui, /MYRO_TEST_EMAIL/)
  assert.doesNotMatch(ui, /MYRO_TEST_PASSWORD/)
  const route = read("app/dev/qa-session/route.ts")
  assert.match(route, /MYRO_TEST_EMAIL/)
  assert.match(route, /\/auth\/login/)
  assert.doesNotMatch(route, /console\.(log|info|debug|error)/)
})

test("qa:mobile does not walk the lab", () => {
  const gate = readFileSync(join(REPO, "scripts/qa-mobile-capture.py"), "utf8")
  assert.doesNotMatch(gate, /\/dev\/phone/)
})

test("robots and the public-route registry keep /dev private", () => {
  assert.match(read("app/robots.ts"), /"\/dev"/)
  assert.match(read("scripts/ui-drift-guard.mjs"), /"dev"/)
  assert.match(read("app/dev/layout.tsx"), /index: false/)
})
