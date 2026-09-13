#!/usr/bin/env node
/**
 * Reach guard — the sixth gate. "Can a user actually get to this?"
 *
 * Why this exists: the other five gates (pytest, ruff, tsc, lint, ui-drift,
 * build) all prove the code is CORRECT. Not one of them can tell you whether
 * anybody can reach it. Every dead surface in this repo passed all five on the
 * day it shipped.
 *
 * The specimen: /notebook shipped 2026-07-06 with "nav placement is a Shivam
 * product call" in its own commit message. The call never came. It sat
 * unreachable for 68 days, took ZERO rows in production, and was deleted
 * 2026-09-12. Nobody was wrong at any step — the work was done and the handoff
 * was explicit. It still died, because "functional and linkable" was treated as
 * done when it was done minus one decision that had no owner and no place it
 * would surface again.
 *
 * This is that place.
 *
 * WHAT IT ENFORCES: every route with a page.tsx must be referenced from at
 * least one other file, OR declared in reach-allowlist.json with a reason.
 * A route nothing links to is not shipped — it is a draft with a URL.
 *
 * WHAT IT DELIBERATELY DOES NOT ENFORCE: usage. A new feature legitimately has
 * zero users on day one; failing on that would block every launch. Low usage is
 * a product question, answered by `python backend/scripts/loop_reach.py` and
 * docs/FEATURE_LOOP_REGISTRY.md.
 * Unreachability is a build defect, and that is what fails here.
 *
 * The allowlist has two sections and they mean different things:
 *   external — entered from outside the app (campaign landing, admin, PWA
 *              fallback, deep link). Legitimate forever. Needs a reason.
 *   debt     — known orphans nobody has wired or deleted yet. Visible on every
 *              run so it cannot be forgotten the way /notebook was.
 *
 * Fails when: an unlisted route has no inbound reference, or the debt list
 * grows. Warns when: a debt entry is now referenced (wire it, then delete the
 * entry) or a route hangs by a single reference.
 *
 * Usage:
 *   npm run check:reach
 *   npm run check:reach -- --json     machine-readable summary
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, extname, relative, sep } from "node:path"

const ROOT = process.cwd()
const ALLOWLIST_PATH = join(ROOT, "scripts", "reach-allowlist.json")
const APP_DIR = join(ROOT, "app")
const SRC_DIRS = ["app", "components", "lib"]
const SRC_EXTS = new Set([".ts", ".tsx", ".mjs", ".js"])
const JSON_OUT = process.argv.includes("--json")

/** Every file we search for links. */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SRC_EXTS.has(extname(full))) out.push(full)
  }
  return out
}

/** app/(authed)/cv/export/page.tsx → /cv/export. Next.js (group) segments are
 *  routing-invisible, so they are stripped. */
function routeOf(pageFile) {
  const segments = relative(APP_DIR, pageFile).split(sep).slice(0, -1)
  const visible = segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")))
  return "/" + visible.join("/")
}

function pageFiles() {
  return walk(APP_DIR).filter(
    (f) => f.endsWith(`${sep}page.tsx`) || f.endsWith(`${sep}page.ts`)
  )
}

/**
 * Is this page a forwarding shim for a retired URL?
 *
 * A retired route SHOULD keep a redirect: the old link lives in emails, in
 * screenshots, in someone's bookmarks, and a 404 is a worse answer than a
 * forward. /myro → /market and /diary → /practice both say so in their own
 * comments, and /diary carries query params through so deep links from pipeline
 * cards keep working.
 *
 * So a redirect stub is not a dead end — it is a door to somewhere else, and
 * flagging it as debt teaches the reader to ignore this gate's output. The
 * heuristic only ever applies to a page with ZERO inbound links, where a body
 * that does nothing but redirect can only be a shim.
 */
function isRedirectShim(pageFile) {
  const body = stripComments(readFileSync(pageFile, "utf8"))
  return /\bredirect\s*\(/.test(body) || /\brouter\.(replace|push)\s*\(/.test(body)
}

/**
 * Files that mention a path but are NOT links to it.
 *   robots.ts — a Disallow list. Naming a page here is the OPPOSITE of linking
 *               to it, and counting it would mark every deliberately-hidden
 *               route "reachable". This cost a correction on the gate's first
 *               run: /mission, /myro, /xp and /diary all looked wired and were
 *               named only as crawler exclusions.
 */
const NOT_A_LINK = new Set([join("app", "robots.ts")])

/** Comments describe; they do not navigate. A path named in prose is not a link. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const files = SRC_DIRS.flatMap((d) => walk(join(ROOT, d))).filter(
  (f) => !NOT_A_LINK.has(relative(ROOT, f))
)
const contents = new Map(files.map((f) => [f, stripComments(readFileSync(f, "utf8"))]))

/**
 * How many files OTHER than the route's own folder link to this route?
 *
 * The match must END the path — quote, backtick, `?` or `#`. A trailing `/` is
 * deliberately NOT accepted: "/diary/entry" in lib/api.ts is a BACKEND endpoint
 * that happens to share a name with a frontend route, and "/preparations/123"
 * reaches the [jobId] page, not /preparations itself. Counting either would
 * call an orphan reachable, which is the one mistake this gate must not make.
 */
function inboundRefs(route) {
  const own = join(ROOT, "app") + route.split("/").join(sep) + sep
  const pattern = new RegExp(`["'\`]${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:["'\`?#])`)
  const hits = []
  for (const [file, text] of contents) {
    // A route's own files linking to themselves prove nothing. Group segments
    // mean the on-disk path differs from the route, so check both spellings.
    if (file.startsWith(own)) continue
    if (file.includes(`${sep}${route.split("/").filter(Boolean).join(sep)}${sep}`) && file.startsWith(join(ROOT, "app"))) continue
    if (pattern.test(text)) hits.push(relative(ROOT, file))
  }
  return hits
}

const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
const external = allowlist.external ?? {}
const debt = allowlist.debt ?? {}

const unreachable = []   // hard failures: nothing links here, nothing explains it
const thin = []          // one link only — a single edit away from orphaned
const shims = []         // retired URLs kept alive as forwards
const debtStillDead = []
const debtNowWired = []

const routeToFile = new Map()
for (const f of pageFiles()) if (!routeToFile.has(routeOf(f))) routeToFile.set(routeOf(f), f)

for (const route of [...routeToFile.keys()].sort()) {
  if (route.includes("[")) continue // dynamic segments are linked by their builder
  const refs = inboundRefs(route)
  if (route in debt) {
    ;(refs.length === 0 ? debtStillDead : debtNowWired).push({ route, refs: refs.length })
    continue
  }
  if (route in external) continue
  if (refs.length === 0 && isRedirectShim(routeToFile.get(route))) { shims.push(route); continue }
  if (refs.length === 0) unreachable.push(route)
  else if (refs.length === 1) thin.push({ route, by: refs[0] })
}

if (JSON_OUT) {
  console.log(JSON.stringify({ unreachable, thin, debtStillDead, debtNowWired }, null, 2))
}

const RED = "\x1b[31m", YEL = "\x1b[33m", GRN = "\x1b[32m", DIM = "\x1b[2m", OFF = "\x1b[0m"
let failed = false

if (unreachable.length) {
  failed = true
  console.error(`\n${RED}✗ ${unreachable.length} route(s) nothing links to:${OFF}`)
  for (const r of unreachable) console.error(`    ${r}`)
  console.error(`
  A route with no inbound link is not shipped — it is a draft with a URL.
  Pick one:
    · link it from where the user already is (nav, a card, a next step), or
    · add it to scripts/reach-allowlist.json → "external" WITH A REASON, if it
      is genuinely entered from outside (campaign landing, admin, deep link), or
    · delete it.

  ${DIM}"Nav placement is a product call" is not a resolution. If the link is
  someone else's decision, the work is BLOCKED, not done — put it in BACKLOG
  with an owner, and add it to "debt" here so it stays visible.${OFF}`)
}

if (debtNowWired.length) {
  failed = true
  console.error(`\n${RED}✗ ${debtNowWired.length} debt route(s) are now reachable — remove them from the allowlist:${OFF}`)
  for (const d of debtNowWired) console.error(`    ${d.route}  (${d.refs} inbound ref(s))`)
  console.error(`  ${DIM}A stale debt entry hides the next real orphan.${OFF}`)
}

if (debtStillDead.length) {
  console.error(`\n${YEL}⚠ ${debtStillDead.length} known dead end(s) — still unreachable:${OFF}`)
  for (const d of debtStillDead) console.error(`    ${d.route}  ${DIM}${debt[d.route]}${OFF}`)
}

if (thin.length) {
  console.error(`\n${DIM}· ${thin.length} route(s) hang by a single reference (not a failure):${OFF}`)
  for (const t of thin) console.error(`${DIM}    ${t.route}  ←  ${t.by}${OFF}`)
}

if (failed) {
  console.error(`\n${RED}Reach gate FAILED.${OFF}\n`)
  process.exit(1)
}

console.error(
  `\n${GRN}✓ Every route is reachable${OFF} ` +
  `${DIM}(${Object.keys(external).length} external, ${shims.length} retired-URL forwards, ` +
  `${debtStillDead.length} known dead ends carried)${OFF}\n` +
  `${DIM}  Reachable ≠ used. For whether anyone goes round the loop:${OFF}\n` +
  `${DIM}    python backend/scripts/loop_reach.py   →  docs/FEATURE_LOOP_REGISTRY.md${OFF}\n`
)
