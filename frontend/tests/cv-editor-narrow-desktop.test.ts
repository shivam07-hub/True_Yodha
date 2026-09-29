/**
 * The job CV editor between the phone layout (≤900px) and a wide desktop.
 *
 * Measured 2026-09-30 at a 1024px window: the header's job line was 12px wide
 * and ⋯ (the only way to pick a download template) ended at x=1055, off the
 * screen; the toolbar's page-fill bar ran 64px past the editor column into the
 * rail's Fixes tab. The header is one sticky 64px row, so neither may wrap.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import postcss, { AtRule, Rule } from "postcss"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")

/** Every declaration for `selector`, with the at-rule params it sits under. */
function decls(rel: string, selector: string): { prop: string; value: string; at: string | null }[] {
  const out: { prop: string; value: string; at: string | null }[] = []
  postcss.parse(read(rel)).walkRules((rule: Rule) => {
    if (!rule.selectors.includes(selector)) return
    const at = rule.parent instanceof AtRule ? `@${rule.parent.name} ${rule.parent.params}` : null
    rule.walkDecls(d => { out.push({ prop: d.prop, value: d.value, at }) })
  })
  return out
}

test("901–1279px: the requirements pill yields so the job line and ⋯ fit", () => {
  const pill = decls("app/(authed)/cv/playground-v2-base.css", ".cvb-v2-reqpill:not(.cvb-v2-metacta)")
  assert.deepEqual(pill, [{
    prop: "display", value: "none",
    at: "@media (min-width: 901px) and (max-width: 1279px)",
  }])
})

test("the toolbar's counts yield before the page fact, and the bar shrinks on every width", () => {
  const base = "app/(authed)/cv/cv-workstation-base.css"
  assert.ok(decls(base, ".cvw-toolbar").some(d => d.prop === "container-type" && d.value === "inline-size"))
  assert.deepEqual(decls(base, ".cvw-fill-counts"), [
    { prop: "display", value: "none", at: "@container (max-width: 679px)" },
  ])
  const bar = Object.fromEntries(decls(base, ".cvw-fill-bar").filter(d => d.at === null).map(d => [d.prop, d.value]))
  assert.equal(bar.flex, "0 1 auto")
  assert.equal(bar["min-width"], "24px")
  // The phone override is gone because the base rule already does its job.
  assert.deepEqual(decls("app/(authed)/cv/cv-workstation-chrome.css", ".cvw-fill-bar"), [])

  const toolbar = read("components/cv/builder/cv-pane-toolbar.tsx")
  assert.match(toolbar, /<span className="cvw-fill-counts">\{lineCount\} lines · ~\{wordCount\} words · <\/span>\s*\{pages\} · \{pageFill\.pct\}%/)
})
