import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()
const read = (path: string) => readFileSync(join(frontendRoot, path), "utf8")

test("brand tokens implement the superseding light and dark palettes", () => {
  const tokens = read("app/design-tokens.css")

  assert.match(tokens, /--tm-bg:\s*#050505/)
  assert.match(tokens, /--tm-surface:\s*#101010/)
  assert.match(tokens, /--tm-text:\s*#F7F7F7/)
  assert.match(tokens, /--tm-interactive:\s*#12BFA5/)
  assert.match(tokens, /:root\[data-surface="light"\]\s*{[\s\S]*--tm-bg:\s*#F9F9F9/)
  assert.match(tokens, /:root\[data-surface="light"\]\s*{[\s\S]*--tm-text:\s*#262626/)
  assert.match(tokens, /:root\[data-surface="light"\]\s*{[\s\S]*--tm-interactive:\s*#FF4C00/)
})

test("layout defaults to light mode and uses Inter as the core font", () => {
  const layout = read("app/layout.tsx")

  assert.match(layout, /Inter/)
  assert.doesNotMatch(layout, /Plus_Jakarta_Sans/)
  assert.doesNotMatch(layout, /Source_Serif_4/)
  assert.match(layout, /data-surface="light"/)
  assert.doesNotMatch(layout, /prefers-color-scheme:\s*dark/)
})

test("global rhythm exposes separate desktop and phone contracts", () => {
  const tokens = read("app/design-tokens.css")
  const globals = read("app/globals.css")
  const publicNav = read("components/public/public-nav.css")

  assert.match(tokens, /--tm-page-px:\s*32px/)
  assert.match(tokens, /--tm-mobile-page-px:\s*16px/)
  assert.match(tokens, /--tm-desktop-nav-h:\s*60px/)
  assert.match(tokens, /--tm-mobile-topbar-h:\s*56px/)
  assert.match(tokens, /--tm-mobile-bottomnav-h:\s*64px/)
  assert.match(globals, /height:\s*calc\(var\(--tm-mobile-topbar-h\)/)
  assert.match(globals, /height:\s*calc\(var\(--tm-mobile-bottomnav-h\)/)
  assert.match(publicNav, /height:\s*var\(--tm-mobile-topbar-h\)/)
})

test("button primitive uses the superseding radius and theme-specific CTA tokens", () => {
  const button = read("components/ui/button.tsx")

  assert.match(button, /rounded-\[var\(--tm-button-radius\)\]/)
  assert.match(button, /bg-\[var\(--tm-interactive\)\]/)
  assert.doesNotMatch(button, /rounded-\[var\(--tm-radius\)\]/)
})

test("high-impact CSS no longer imports decorative one-off display fonts", () => {
  const mission = read("app/(authed)/home/mission-control.css")
  const firstRun = read("components/home/first-run-hero.css")

  assert.doesNotMatch(mission, /fonts\.googleapis\.com/)
  assert.doesNotMatch(mission, /Instrument Serif/)
  assert.doesNotMatch(firstRun, /font-serif|Georgia/)
})

test("shared shells do not mount decorative particle canvases", () => {
  const appShell = read("components/app-shell.tsx")
  const authShell = read("components/auth/auth-page-shell.tsx")
  const intelPage = read("app/intel/page.tsx")

  assert.doesNotMatch(appShell, /ParticleBg/)
  assert.doesNotMatch(authShell, /ParticleBg/)
  assert.doesNotMatch(intelPage, /ParticleBg/)
})
