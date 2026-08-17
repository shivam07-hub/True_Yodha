import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()
const read = (path: string) => readFileSync(join(frontendRoot, path), "utf8")

/**
 * Offset of the light-surface RULE (not the prose mention of it in the header
 * comment — matching that silently truncated the dark block to the file header
 * and made every dark assertion vacuous).
 */
function lightSurfaceIndex(tokens: string): number {
  const m = tokens.match(/^:root\[data-surface="light"\]/m)
  assert.ok(m?.index !== undefined, "design-tokens.css must declare a :root[data-surface=\"light\"] rule")
  return m!.index!
}

/**
 * Offset of the INK surface rule — the dark-only navy the public marketing
 * pages run (DECISIONS.md §Marketing ink surface). It follows the light block
 * in source order, so without this boundary the "light" slice swallows it and
 * the ink palette goes unchecked — the same vacuous-assertion trap the helper
 * above exists to prevent.
 */
function inkSurfaceIndex(tokens: string): number {
  const m = tokens.match(/^html:root:has\(\.tm-ink\)/m)
  assert.ok(m?.index !== undefined, "design-tokens.css must declare an html:root:has(.tm-ink) rule")
  return m!.index!
}

/**
 * ⚠️ MAINTENANCE CONTRACT — read before "fixing" a failure here.
 *
 * These hexes are a deliberate brand LOCK. If you changed the palette on
 * purpose, update this test IN THE SAME COMMIT. Never leave it red.
 *
 * History (the reason this warning exists): the palette was warmed on
 * 2026-06-16 and this test kept asserting the retired cool Engine values
 * (#0a0a0c / #13141a). It stayed red for over a month, got logged in session
 * notes as "1 PRE-EXISTING warm-token hex fail", and became background noise —
 * so the one automated check on brand colour was blind while THREE different
 * dark palettes shipped side by side. A red check with no owner is not a
 * check. See CLAUDE.md #28.
 */
test("brand tokens implement the canonical Myro light + dark + ink palettes", () => {
  const tokens = read("app/design-tokens.css")
  const darkBlock = tokens.slice(0, lightSurfaceIndex(tokens))
  const lightBlock = tokens.slice(lightSurfaceIndex(tokens), inkSurfaceIndex(tokens))
  const inkBlock = tokens.slice(inkSurfaceIndex(tokens))

  // DARK = one dark, site-wide (2026-07-27). Adopted wholesale from the mobile
  // redesign ramp after Jobs/Collections were judged the standard; supersedes
  // both the retired cool Engine (#0a0a0c) and the warm-brown (#100c09) ramps.
  // Still the PRODUCT surface — the ink block below did not replace it.
  assert.match(darkBlock, /--tm-bg:\s*#191918/)
  assert.match(darkBlock, /--tm-surface:\s*#212120/)
  assert.match(darkBlock, /--tm-text:\s*#f2f2ee/)
  assert.match(darkBlock, /--tm-interactive:\s*#00f5d4/)

  // LIGHT = "Firecrawl paper" — warm paper + orange. Its OWN brand, not a
  // teal inverse.
  assert.match(lightBlock, /--tm-bg:\s*#faf6f0/)
  assert.match(lightBlock, /--tm-surface:\s*#fffdfa/)
  assert.match(lightBlock, /--tm-text:\s*#29241e/)
  assert.match(lightBlock, /--tm-interactive:\s*#FF4C00/)

  // INK = the public marketing surface (2026-08-17), navy and dark-only. Teal
  // is re-pinned here on purpose: inheriting light's orange would put a warm
  // accent on a cool page, which is the defect this surface exists to fix.
  assert.match(inkBlock, /--tm-bg:\s*#050a18/)
  assert.match(inkBlock, /--tm-surface:\s*#0b1424/)
  assert.match(inkBlock, /--tm-text:\s*#e8f0ff/)
  assert.match(inkBlock, /--tm-interactive:\s*#00f5d4/)
})

/**
 * Ink is dark-only BY SPECIFICITY, not by source order. If someone re-scopes it
 * to a bare `:root:has(...)` — (0,2,0), tying with :root[data-surface="light"]
 * — a light-preference visitor gets paper tokens bleeding onto a navy page, and
 * it breaks only for the subset of visitors who chose light. Nothing else here
 * would catch that, so pin the selector shape.
 */
test("the ink surface outranks the light surface regardless of source order", () => {
  const tokens = read("app/design-tokens.css")

  // `html` + `:root` + :has(class) = (0,2,1) > :root[attr] = (0,2,0).
  assert.match(tokens, /^html:root:has\(\.tm-ink\)\s*\{/m)
  // The deep field must stay lit on ink even when the root asked for light.
  assert.match(tokens, /html:root:has\(\.tm-ink\) body::before\s*\{\s*display:\s*block;/)
})

/**
 * Rot-resistant companion to the hex lock above. Hex assertions go stale the
 * moment design moves; these invariants hold across ANY palette, so they keep
 * catching the actual bug class even if someone updates hexes carelessly.
 *
 * The bug they catch is the one that shipped: text tuned for one surface
 * rendered on the other, which is how "My CV" / "Preparations" / "How Myro
 * Coins work" ended up as near-black headings on a near-black page while
 * their own subheadings stayed readable — hierarchy inverted by accident.
 *
 * House rule encoded here: in BOTH themes the card lifts TOWARD white off the
 * page (dark #212120 over #191918; light #fffdfa over #faf6f0). A card that
 * sinks below its page reads as a hole, not a surface.
 */
test("each surface keeps card above page, and text legible against its own page", () => {
  const tokens = read("app/design-tokens.css")
  const lightIdx = lightSurfaceIndex(tokens)

  const hexOf = (block: string, name: string) => {
    const m = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
    assert.ok(m, `--${name} must be defined as a 6-digit hex in this surface block`)
    return m![1]
  }
  // WCAG relative luminance.
  const lum = (hex: string) => {
    const ch = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    const lin = ch.map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  }
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  const inkIdx = inkSurfaceIndex(tokens)

  for (const [label, block] of [
    ["dark", tokens.slice(0, lightIdx)],
    ["light", tokens.slice(lightIdx, inkIdx)],
    ["ink", tokens.slice(inkIdx)],
  ] as const) {
    const bg = hexOf(block, "tm-bg")
    const surface = hexOf(block, "tm-surface")
    const text = hexOf(block, "tm-text")
    const muted = hexOf(block, "tm-text-muted")

    assert.ok(
      lum(surface) > lum(bg),
      `${label}: --tm-surface (${surface}) must lift ABOVE --tm-bg (${bg}) — a card darker than its page reads as a hole`,
    )
    // Lift must also be *perceptible*, not just numerically positive.
    assert.ok(
      contrast(surface, bg) >= 1.04,
      `${label}: --tm-surface vs --tm-bg is only ${contrast(surface, bg).toFixed(3)}:1 — the card is invisible against the page`,
    )
    assert.ok(
      contrast(text, bg) >= 7,
      `${label}: --tm-text on --tm-bg is ${contrast(text, bg).toFixed(1)}:1, below the 7:1 AAA target`,
    )
    assert.ok(
      contrast(muted, bg) >= 4.5,
      `${label}: --tm-text-muted on --tm-bg is ${contrast(muted, bg).toFixed(1)}:1, below the 4.5:1 AA body target`,
    )
  }
})

test("layout follows the OS surface by default and uses Space Grotesk (Inter fallback)", () => {
  const layout = read("app/layout.tsx")

  // Space Grotesk is the core family site-wide; Inter stays in the fallback
  // stack so text never disappears if Grotesk fails to load.
  assert.match(layout, /Space_Grotesk/)
  assert.match(layout, /Inter/)
  assert.doesNotMatch(layout, /Plus_Jakarta_Sans/)
  assert.doesNotMatch(layout, /Source_Serif_4/)
  // SSR ships data-surface="light" as the no-JS fallback, but the init script
  // resolves a no-pref visitor to their OS theme (prefers-color-scheme), which
  // MUST match use-surface.ts's "system" default.
  assert.match(layout, /data-surface="light"/)
  assert.match(layout, /prefers-color-scheme/)
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
  // first-run-hero.css deleted with the /home dashboard (Collections cutover
  // 2026-07-07); mission-control.css survives as the workspace-rail stylesheet.
  const mission = read("app/(authed)/home/mission-control.css")

  assert.doesNotMatch(mission, /fonts\.googleapis\.com/)
  assert.doesNotMatch(mission, /Instrument Serif/)
})

test("shared shells do not mount decorative particle canvases", () => {
  const appShell = read("components/app-shell.tsx")
  const authShell = read("components/auth/auth-page-shell.tsx")
  const intelPage = read("app/intel/page.tsx")

  assert.doesNotMatch(appShell, /ParticleBg/)
  assert.doesNotMatch(authShell, /ParticleBg/)
  assert.doesNotMatch(intelPage, /ParticleBg/)
})
