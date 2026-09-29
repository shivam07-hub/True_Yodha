import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { posix } from "node:path"
import test from "node:test"
import postcss, { AtRule } from "postcss"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** Stylesheets in the order the browser applies them: an @import lands before
 *  the importing file's own rules, wherever it is written. */
function loadOrder(rel: string): string[] {
  const imported: string[] = []
  postcss.parse(read(rel)).walkAtRules("import", at => {
    const path = at.params.match(/["'](.+?)["']/)?.[1]
    if (path) imported.push(...loadOrder(posix.join(posix.dirname(rel), path)))
  })
  return [...imported, rel]
}

// page.tsx and public-playground.tsx both load playground-v2.css, then cv-workstation.css.
const CHROME = [
  ...loadOrder("app/(authed)/cv/playground-v2.css"),
  ...loadOrder("app/(authed)/cv/cv-workstation.css"),
]

test("CV is a workspace: 360 rail against a fluid room", () => {
  const shell = code("components/cv/builder/workstation-shell.tsx")
  const live = code("app/(authed)/cv/playground-v2-base.css")
  const skel = code("components/loading/route-loading/skeleton-mirrors/cv-workstation-skeleton.tsx")
  const tokens = read("app/design-tokens.css")

  assert.match(shell, /className="cvb-v2-main"/)
  assert.ok(shell.indexOf("cvb-v2-editor") < shell.indexOf("<WorkstationRail"))
  assert.match(live, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--tm-workspace-rail\)/)
  assert.doesNotMatch(live, /320px/)
  assert.match(tokens, /--tm-workspace-rail:\s*360px/)

  assert.match(skel, /var\(--tm-workspace-rail\)/)
  assert.doesNotMatch(skel, /400px/)
  assert.match(skel, /<CVMobileWorkstationSkeleton\s*\/>/)
})

test("CV chrome uses the six rungs; Geist stays on the sheet", () => {
  for (const file of CHROME) {
    const css = code(file)
    assert.doesNotMatch(css, /font-size:\s*[0-9.]+px/, `${file} still free-types a size`)
    assert.doesNotMatch(css, /font-weight:\s*7/, `${file} still uses 700+`)
    assert.doesNotMatch(css, /border-radius:\s*99/, `${file} still uses a pill radius`)
    assert.doesNotMatch(css, /--tm-fs-ui\b/, `${file} still uses a ui alias`)
    assert.doesNotMatch(css, /font-style:\s*italic/, `${file} still italicises chrome`)
  }

  const sheet = read("app/(authed)/cv/cv-sheet.css")
  const fonts = read("app/(authed)/cv/cv-fonts.css")
  assert.match(sheet, /font-family:\s*"Geist"/)
  assert.match(fonts, /font-family:\s*"Geist"/)
  assert.doesNotMatch(code("app/(authed)/cv/cv-sheet.css"), /--tm-font-sans/)
})

// A shorthand resets its longhands, so `padding-bottom` in a phone block loses
// to a later `padding` just as surely as to a later `padding-bottom`.
const SHORTHAND: Record<string, RegExp> = {
  padding: /^padding-/, margin: /^margin-/, overflow: /^overflow-/, background: /^background-/,
  flex: /^flex-(grow|shrink|basis)$/, gap: /^(row|column)-gap$/, inset: /^(top|right|bottom|left)$/,
  border: /^border-(top|right|bottom|left|width|style|color)/,
  font: /^(font-(family|size|weight|style|variant)|line-height)$/,
}
const overlaps = (a: string, b: string) => a === b || !!SHORTHAND[a]?.test(b) || !!SHORTHAND[b]?.test(a)

test("every phone override loads after the rule it overrides", () => {
  // Media queries add no specificity, so a ≤900px rule that loads before its
  // base rule loses on every phone. The split that @imported the rail files at
  // the top of their bases did exactly this: at 375px the editor kept its 360px
  // rail column, collapsed to 0px, and the rail tabs painted under the toolbar.
  const base: { sel: string; prop: string; at: number }[] = []
  const phone: { sel: string; prop: string; at: number; file: string }[] = []
  let at = 0
  for (const file of CHROME) {
    postcss.parse(read(file)).walkRules(rule => {
      const media = rule.parent instanceof AtRule ? rule.parent.params : null
      rule.walkDecls(decl => {
        at += 1
        for (const sel of rule.selectors) {
          if (media === null) base.push({ sel, prop: decl.prop, at })
          else if (/max-width/.test(media)) phone.push({ sel, prop: decl.prop, at, file })
        }
      })
    })
  }
  const beaten = phone
    .filter(p => base.some(b => b.sel === p.sel && b.at > p.at && overlaps(b.prop, p.prop)))
    .map(p => `${p.sel} { ${p.prop} } in ${p.file}`)
  assert.deepEqual(beaten, [])
})
