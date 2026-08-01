import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"

/**
 * State-transition completeness.
 *
 * The regression: `.csp-step-dot` declared `transition: transform,
 * background-color, border-color`, then its `.is-pending` / `.is-done` /
 * `.is-active` variants changed `border-width` (via the `border` shorthand) and
 * `opacity` — neither of which was in that list. Those two snapped while the
 * rest eased, so every step advance flashed a half-formed grey ring for 260ms.
 * That happened three times in the first eight seconds of a CV upload, i.e.
 * every single user saw it, and every automated check was green: `tsc` reads
 * types, `eslint` reads syntax, the ui-drift guard greps file contents, and
 * none of them animates anything.
 *
 * The rule enforced here: if an element opts into animation by declaring
 * `transition`, then every visual property its own state variants change must
 * be in that transition list. Restricting the check to elements that already
 * declare `transition` is what keeps it precise — it only ever says "you meant
 * to animate this and missed one", never "you should animate this".
 */

const frontendRoot = process.cwd()
const cssRoots = ["app", "components", "mobile"]

/** Properties whose value visibly jumps mid-animation if left untransitioned.
 *  Layout-only and non-visual properties are deliberately out of scope. */
const SNAPPY = new Set([
  "opacity",
  "transform",
  "color",
  "background-color",
  "border-color",
  "border-width",
  "box-shadow",
  "border-radius",
  "outline-color",
  "filter",
])

/** Shorthands that silently set one of the properties above. */
const EXPAND: Record<string, string[]> = {
  border: ["border-width", "border-color"],
  "border-top": ["border-width", "border-color"],
  "border-right": ["border-width", "border-color"],
  "border-bottom": ["border-width", "border-color"],
  "border-left": ["border-width", "border-color"],
  background: ["background-color"],
  outline: ["outline-color"],
  "box-shadow": ["box-shadow"],
}

function expand(property: string): string[] {
  if (EXPAND[property]) return EXPAND[property]
  return SNAPPY.has(property) ? [property] : []
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return cssFiles(path)
    return path.endsWith(".css") ? [path] : []
  })
}

interface Rule {
  selector: string
  decls: Array<[string, string]>
}

/** Deliberately small: flatten at-rules, then split top-level `sel { decls }`.
 *  Nested at-rules are unwrapped so `@media` variants are checked like any
 *  other rule — a state that only differs inside a media query snaps too. */
function parseRules(css: string): Rule[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const rules: Rule[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped)) !== null) {
    const selector = m[1].trim()
    if (!selector || selector.startsWith("@")) continue
    const decls = m[2]
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .flatMap((d): Array<[string, string]> => {
        const i = d.indexOf(":")
        if (i < 0) return []
        return [[d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]]
      })
    if (decls.length) rules.push({ selector, decls })
  }
  return rules
}

/** The element a selector ultimately targets: the last class in the last
 *  compound. `.csp-step.is-active .csp-step-dot` → `.csp-step-dot`. */
function targetClass(selector: string): string | null {
  const compound = selector.split(/[\s>+~]+/).filter(Boolean).pop()
  if (!compound || compound.includes(":") || compound.includes("[")) return null
  const classes = compound.match(/\.[A-Za-z0-9_-]+/g)
  if (!classes) return null
  return classes[classes.length - 1]
}

/**
 * A selector is a STATE variant when it carries something that toggles at
 * runtime on the same element. Context-only overrides are not states: a given
 * element either sits inside `.mdx-prose` or it does not, permanently, so
 * `.mdx-prose a.nl-pill { color }` can never snap — there is no transition
 * between the two for the browser to animate. Flagging those made the check
 * noisy, and a noisy gate is one people learn to skip.
 */
const STATE_TOKEN = /(:hover|:focus|:active|:disabled|:checked|:target|\[data-|\[aria-|\.is-|\.open\b|\.active\b|\.selected\b|\.expanded\b|\.done\b|\.pending\b|\.busy\b|\.error\b|\.dragging\b)/

function isStateVariant(selector: string, target: string): boolean {
  return selector.trim() !== target && STATE_TOKEN.test(selector)
}

function transitionedProps(value: string): Set<string> {
  const props = new Set<string>()
  for (const part of value.split(",")) {
    const name = part.trim().split(/\s+/)[0]?.toLowerCase()
    if (!name) continue
    if (name === "all") return new Set(["*"])
    for (const p of expand(name)) props.add(p)
    props.add(name)
  }
  return props
}

interface Finding {
  file: string
  target: string
  property: string
  selector: string
}

function findSnaps(): Finding[] {
  const findings: Finding[] = []

  for (const root of cssRoots) {
    for (const path of cssFiles(join(frontendRoot, root))) {
      const rules = parseRules(readFileSync(path, "utf8"))

      // Group every rule by the element it targets.
      const groups = new Map<string, Rule[]>()
      for (const rule of rules) {
        for (const sel of rule.selector.split(",")) {
          const target = targetClass(sel)
          if (!target) continue
          const list = groups.get(target) ?? []
          list.push({ selector: sel.trim(), decls: rule.decls })
          groups.set(target, list)
        }
      }

      for (const [target, list] of Array.from(groups)) {
        // Union every transition declared for this element, not just the first.
        // An element is commonly styled by several non-state rules (a grouped
        // selector plus a dedicated one); taking only the first read
        // `.cvb-rv-ways, .cvb-rv-expand { transition: opacity }` and missed the
        // `.cvb-rv-expand { transition: transform, color }` two rules later.
        const declared = new Set<string>()
        let opted = false
        for (const rule of list) {
          if (isStateVariant(rule.selector, target)) continue
          const t = rule.decls.find(([p]) => p === "transition")
          if (!t) continue
          opted = true
          for (const p of Array.from(transitionedProps(t[1]))) declared.add(p)
        }
        // Only elements that opted into animation at all.
        if (!opted || declared.has("*")) continue

        const seen = new Set<string>()
        for (const rule of list) {
          if (!isStateVariant(rule.selector, target)) continue
          for (const [property] of rule.decls) {
            for (const resolved of expand(property)) {
              if (declared.has(resolved) || seen.has(resolved)) continue
              seen.add(resolved)
              findings.push({
                file: relative(frontendRoot, path),
                target,
                property: resolved,
                selector: rule.selector,
              })
            }
          }
        }
      }
    }
  }
  return findings
}

/**
 * Ratchet, in the established ui-drift-guard idiom: the codebase predates this
 * check, so the existing count is frozen and may only ever go DOWN. A new
 * untransitioned state property fails the build. Lower this number when you
 * fix some; never raise it.
 */
const BASELINE = 0

test("state variants never change a property their element forgot to transition", () => {
  const findings = findSnaps()
  const report = findings
    .map((f) => `  ${f.file}  ${f.selector} changes ${f.property}, which ${f.target}'s transition does not list`)
    .join("\n")

  assert.ok(
    findings.length <= BASELINE,
    `${findings.length} untransitioned state change(s), baseline ${BASELINE}:\n${report}\n\n` +
      `Add the property to the element's \`transition\`, or hold it constant across states.`,
  )
})

test("the CV upload progress markers stay animation-complete", () => {
  // The specific regression, pinned. Every state of `.csp-step-dot` must be
  // reachable without a snap, because the user sees three of these advances
  // inside the first eight seconds of every upload.
  const offenders = findSnaps().filter((f) => f.target === ".csp-step-dot")
  assert.deepEqual(offenders, [], `\n${offenders.map((o) => `${o.selector} snaps ${o.property}`).join("\n")}`)
})
