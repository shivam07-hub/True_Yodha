#!/usr/bin/env node
/**
 * UI drift guard — the "door check" for design-system consistency.
 *
 * Why this exists: consistency is a trust signal, and it only holds if drift
 * can't silently creep back in (e.g. a second nav styled by hand, a fifth way
 * to format a date). Discipline rots; a build gate doesn't. This is the gate.
 *
 * How it works — a RATCHET, not a wall. Each metric counts how many times a
 * drift pattern appears today. The baseline (ui-drift-baseline.json) records
 * those counts. CI fails only if a count moves the WRONG way:
 *   - mode "max"  → a hand-rolled pattern. Must never INCREASE. The cascade
 *                   (one primitive at a time) drives it DOWN toward 0; lowering
 *                   the baseline locks the win in so it can't regress.
 *   - mode "min"  → a canonical pattern that MUST stay present (single source).
 *                   Must never DECREASE.
 *
 * So it does NOT break CI on day one (baseline == today), but it blocks any new
 * hand-rolled copy the moment it's added. After cleaning a batch, run
 * `npm run check:ui-drift -- --update-baseline` to ratchet the floor down.
 *
 * This is the Linear/Stripe move: shipping the constraint WITH the kit, so the
 * wrong way is rejected automatically instead of caught in review (if at all).
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, extname, relative } from "node:path"

const ROOT = process.cwd()
const BASELINE_PATH = join(ROOT, "scripts", "ui-drift-baseline.json")
const SRC_DIRS = ["app", "components", "mobile", "lib"]

/**
 * Each metric: a named drift pattern.
 * - exts:    file extensions to scan
 * - exclude: path substrings to skip (canonical homes are exempt)
 * - pattern: global regex; total match count across files is the metric
 * - file:    optional — scan exactly this one file instead of SRC_DIRS
 * - transform: optional — rewrite file text before matching (e.g. strip CSS
 *              comments, so a rule quoted in a rationale can't count as one)
 * - mode:    "max" (ratchet down) | "min" (must stay present)
 * - hint:    what to do when it trips
 */
const METRICS = [
  {
    name: "publicNavDelegatesAuthedStrip",
    file: "components/public/top-nav.tsx",
    exts: [".tsx"],
    // The public bar's authed view must DELEGATE to the one shared strip, not
    // hand-render its own authed tabs. This is stronger than the old
    // canonical-class check: there's now a single <AuthedTopStrip> both the app
    // shell and the public bar mount, so the two navs cannot diverge (the
    // 2026-07 Delta-4 drift). A drop = someone reintroduced a parallel authed nav.
    pattern: /AuthedTopStripStandalone/g,
    mode: "min",
    hint: "The public bar's authed view must mount the shared <AuthedTopStripStandalone> (the ONE logged-in strip), never hand-render its own authed tabs. Restore the delegation.",
  },
  {
    name: "jsHoverStyleMutation",
    exts: [".tsx"],
    exclude: [],
    pattern: /onMouse(Enter|Leave)/g,
    mode: "max",
    hint: "Hover belongs in CSS `:hover`, not JS style mutation. Use a class/token, not onMouseEnter/onMouseLeave.",
  },
  {
    name: "handRolledModalScrim",
    exts: [".tsx"],
    // mobile/redesign/ is the mobile app's own primitive layer (BottomSheet is
    // the one shared sheet; the other `inset:0` hits are ring-centering, not
    // scrims) — exempt like components/ui/ + components/loading/.
    exclude: ["components/ui/", "components/loading/", "mobile/redesign/"],
    pattern: /inset:\s*0\b/g,
    mode: "max",
    hint: "Don't hand-roll a fixed-inset scrim. Use <Dialog> from @/components/ui/dialog.",
  },
  {
    name: "handRolledPill",
    exts: [".tsx"],
    // mobile/redesign/ = the mobile design system; its pills are bespoke to the
    // handoff spec (the web <Badge> can't reproduce them) — exempt like ui/.
    exclude: ["components/ui/", "mobile/redesign/"],
    pattern: /borderRadius:\s*["']?9{2,4}\b|rounded-full/g,
    mode: "max",
    hint: "Don't hand-roll a pill/badge. Use <Badge> from @/components/ui/badge.",
  },
  {
    name: "readingTextInFaintToken",
    exts: [".css"],
    // --tm-text-faint is ~4.3:1 on the dark surface — it FAILS WCAG AA for text.
    // It's the caption tier: fine on <13px micro-labels, but reading/body text
    // (>=13px) set in faint is the "barely visible on dark" bug that keeps
    // recurring (Deveshwar CV prose, newsletter prose, the Score & Skills
    // standfirst). Decoration (bar fills, hairlines) uses background/border, not
    // `color:`, so keying on a faint TEXT color co-occurring with a >=13px font
    // isolates exactly the failing class without flagging legit small captions.
    pattern: /\{(?=[^{}]*color:\s*var\(--tm-text-faint\))[^{}]*(?:font-size:\s*|font:[^{};]*?)(?:1[3-9]|[2-9]\d)px[^{}]*\}/g,
    mode: "max",
    hint: "Reading/body text (>=13px) coloured with --tm-text-faint fails AA on the dark surface. Use --tm-text-muted for labels or --tm-reading-ink for prose. faint stays for <13px captions and non-text decoration only.",
  },
  {
    name: "rawDateNumberFormat",
    exts: [".tsx", ".ts"],
    exclude: ["lib/format", "scripts/"],
    pattern: /toLocaleDateString|toLocaleString|Intl\.(Date|Number)Format|Intl\.RelativeTimeFormat/g,
    mode: "max",
    hint: "Don't format dates/numbers inline. Use the shared helpers in @/lib/format.",
  },
  {
    name: "rawFontSizeLiteral",
    exts: [".css"],
    // design-tokens.css DEFINES the --tm-fs-* scale (hero/display/title/heading/
    // body/meta/caption) — that's the canonical source, not drift. Everywhere
    // else, font-size should reference one of those tokens, not a hand-picked
    // px/rem/clamp() value (BRAND_IDENTITY.md §6 — disciplined scale, enforced
    // via tokens, not by hoping nobody free-types a size).
    exclude: ["design-tokens.css"],
    // The lookahead sits IMMEDIATELY after the colon and eats the whitespace
    // itself. Written as `\s*(?!var\(--tm-fs-)` it silently matched everything:
    // `\s*` backtracks to zero characters, the lookahead then tests " var(…" —
    // which isn't "var(" — and passes. So every CORRECT token usage counted as a
    // violation, the baseline (1642) was mostly compliant code, and adding a
    // properly-tokenized rule still failed the build. Guards that measure the
    // wrong thing train you to raise the baseline.
    pattern: /font-size:(?!\s*var\(--tm-fs-)[^;{}]+;/g,
    mode: "max",
    hint: "Use a canonical --tm-fs-* scale token (see design-tokens.css) instead of a literal font-size value.",
  },

  /* ── Anti-slop ratchets (ANTI_SLOP.md) ────────────────────────────────
     Three tells that were live drift until 2026-08-21 and are now at zero.
     They are here rather than in a lint rule because the failure mode is
     RECURRENCE, not a first offence: each one got reintroduced by someone
     reaching for the nearest available thing. A ratchet at 0 makes the
     reintroduction the moment you find out, instead of the next sweep.
     ──────────────────────────────────────────────────────────────────── */
  {
    name: "sparkleGlyph",
    exts: [".tsx"],
    // The universal "an AI did this" glyph, and a direct contradiction of our
    // own copy rule (say what a thing does; never say "AI"). It shipped on 7
    // surfaces because there was no right answer to reach for — MyroLogo is a
    // raster <Image> for chrome and can't take currentColor at text size.
    // <MyroMark> is now that answer, so this can hold at zero.
    //
    // Matches USE, not the word: `<Sparkles`, and the `icon: Sparkles` form
    // the nav/step arrays use. Prose mentions (myro-mark.tsx documents why the
    // glyph is banned) must not count — a guard that flags its own rationale
    // is one people delete.
    pattern: /(?:<|icon:\s*)(?:Sparkles?|Wand2|WandSparkles)\b/g,
    mode: "max",
    hint: "Don't say \"AI\" with a glyph. Use the icon of the actual action — or <MyroMark> from @/components/myro-mark when the thing you mean is \"Myro\".",
  },
  {
    name: "bannedPurpleHue",
    exts: [".css"],
    // Purple is the old brand colour and half of the "purple and black" tell.
    // It kept coming back as a raw hex: #7C3AED as the light-surface info
    // tier, #A78BFA as a CV-graph status AND as a var() fallback that would
    // have silently restored it, #8b5cf6 in the admin palette.
    //
    // Two deliberate carve-outs, both encoded in the pattern rather than in a
    // file exclude, so they survive a file being renamed:
    //   1. `--my-*` lines — amethyst IS the Myrology sub-brand's accent.
    //   2. Comments — the hex has to sit in a declaration (after a `:`), so
    //      design-tokens.css can name #7C3AED while explaining its removal.
    pattern: /^(?!.*--my-).*:[^;{}]*#(?:7c3aed|8b5cf6|a78bfa|a855f7|9333ea|7e22ce|6366f1|b084ff|9b72e8)\b/gim,
    mode: "max",
    hint: "Purple is banned outside the Myrology sub-brand. Use a --tm-* status token (--tm-info is the neutral 'variant' tier); for amethyst use --my-amethyst / --my-amethyst-rest, never the hex.",
  },
  {
    name: "cornerOrbWash",
    exts: [".css"],
    // Corner-glow orbs: atmosphere with no information in it. The two that
    // shipped were worse than decorative — they hardcoded BOTH accent hexes
    // at once, so the page broke the one-swappable-accent rule in either
    // mode. Keyed to `circle at top|bottom` so it catches the corner-wash
    // shape specifically and leaves Myrology's `radial-gradient(circle, …)`
    // drifting field alone: on a star-chart page the sky is the subject.
    pattern: /radial-gradient\(\s*circle at (?:top|bottom)/g,
    mode: "max",
    hint: "A background wash must carry information. Corner-glow orbs are atmosphere — drop it, or make the gradient encode something real.",
  },

  /* ── One-surface ratchets (2026-08-24) ────────────────────────────────
     Two defects shipped the same week from the same root: a shared
     primitive that was RIGHT BY RULE and wrong by result, because the
     caller's context wasn't the context the primitive assumed. Neither is
     catchable by review — both look correct in the diff. So each gets a
     ratchet at zero.
     ──────────────────────────────────────────────────────────────────── */
  {
    name: "pinnedColourLiteral",
    exts: [".css"],
    // A colour written as a hex is a colour that cannot follow the theme.
    // /beta-feedback pinned 26 of them — `background: #eef0eb`, cards at #fff,
    // text at #171914 — and rendered a white sheet inside dark chrome for
    // months. Nothing caught it: tsc reads types, eslint reads syntax, and this
    // guard had no colour metric at all. That is the same hole the 2026-07
    // mobile pass climbed out of by hand, 182 literals at a time.
    //
    // design-tokens.css is exempt: it DEFINES the ramps, so its hexes are the
    // canonical source rather than drift.
    //
    // Comments are stripped first — a file has to be able to name the hex it
    // removed while explaining why, and a guard that flags its own rationale is
    // one people delete.
    //
    // Ratchet, not a ban. Deliberate theme-independent islands still count:
    // intel-pane's cold console, the CV sheet's paper, the mobile template
    // thumbnails. They can hold, but the number may only go down, so the next
    // pinned palette has to be argued for rather than merely typed.
    exclude: ["design-tokens.css"],
    transform: (css) => css.replace(/\/\*[\s\S]*?\*\//g, ""),
    // Must sit in a declaration (after a colon), so a selector like `.a#b` and
    // an SVG `url(#gradient)` reference stay out of it.
    pattern: /:[^;{}]*#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
    mode: "max",
    hint: "Colours come from --tm-* tokens (app/design-tokens.css), never a hex. A pinned literal cannot follow [data-surface], which is how a page ends up light inside dark chrome. If the surface is deliberately theme-independent, say so where it is declared and keep the count from rising elsewhere.",
  },
  {
    name: "themeTokenOnPaperSheet",
    exts: [".css"],
    // `.cvb-pdf-page` is white paper under server Chromium — no data-surface,
    // no app stylesheet, no theme. Every --tm-* token that reaches it resolves
    // against the APP's theme instead: a hover painted --tm-surface-2 (#22282b
    // in dark) behind the sheet's #1A1A1A ink measured 1.05:1 and the bullet
    // vanished under the cursor. The sheet names its own colours (--cv-* in
    // cv-sheet.css); anything layered onto it must use those.
    //
    // Comments are stripped first: cv-sheet.css has to be able to NAME the
    // tokens it bans while explaining why, and a guard that flags its own
    // rationale is one people delete.
    transform: (css) => css.replace(/\/\*[\s\S]*?\*\//g, ""),
    pattern: /[^{};]*\.cvb-pdf-page[^{};]*\{[^{}]*var\(--tm-[^{}]*\}/g,
    mode: "max",
    hint: "The CV sheet is theme-independent — it renders as paper in a themeless server Chromium. Use a --cv-* paper token from cv-sheet.css (--cv-ink / --cv-accent / --cv-hover-wash / --cv-select-wash), never an app-chrome --tm-* token.",
  },
  {
    name: "virtualizerOutsideFeed",
    exts: [".tsx", ".ts"],
    // ONE virtual list. <VirtualFeed> is where the scroll-parent discovery,
    // the scrollMargin re-measure and the row-identity contract below live;
    // a second hand-rolled useVirtualizer gets none of them and re-earns the
    // overlapping-cards bug in private.
    exclude: ["components/jobs/virtual-feed.tsx"],
    pattern: /useVirtualizer/g,
    mode: "max",
    hint: "Don't mount @tanstack/react-virtual directly. Use <VirtualFeed> from @/components/jobs/virtual-feed — it owns scroll-parent discovery, scrollMargin and row identity.",
  },
  {
    name: "virtualRowIdentity",
    file: "components/jobs/virtual-feed.tsx",
    exts: [".tsx"],
    // The virtualizer caches measured heights by key, and its DEFAULT key is
    // the index. Feeds splice rows in and out mid-list after first paint
    // (story cards, scope dividers, skip), so index-keyed heights hand each
    // row its neighbour's size and absolutely-positioned cards overlap. The
    // measurement cache must be keyed by the same identity React is given.
    pattern: /getItemKey/g,
    mode: "min",
    hint: "VirtualFeed must pass `getItemKey` to useVirtualizer, matching the `getKey` used for the React key — otherwise measured heights follow position instead of row identity and cards overlap when a row is inserted.",
  },
  /* ── The four beats of a click ─────────────────────────────────────────────
     Heard (the press stamp, globals.css) · Working (<Button loading>) · Slow
     (useIsSlow past ACTION_SLOW_MS) · Settled (the result, or the error beside
     the control). The stamp is global and needs no metric. These four ratchet
     the other three toward the primitives that already implement them, which
     had 4, 2 and 1 consumers respectively when this was written. */
  {
    name: "mutationWithoutBusyState",
    exts: [".tsx"],
    exclude: ["components/ui/"],
    // A `useMutation` whose `isPending` is never read anywhere in its file: the
    // click starts work and the screen says nothing until the answer lands.
    // Two things in one file, so this cannot be one regex.
    count: (src) => {
      if (!src.includes("useMutation")) return 0
      const names = [...src.matchAll(/const\s+(\w+)\s*=\s*useMutation/g)].map((m) => m[1])
      // `onMutate` is the OTHER honest Working state: the row shows the result
      // on the click and rolls back on error. Not a gap — a better answer.
      const optimistic = (src.match(/onMutate:/g) ?? []).length
      const silent = names.filter((n) => {
        // Three honest answers, any one of which is enough:
        //   isPending  — this file renders the Working state itself
        //   mutateAsync — the promise is handed to a caller who awaits it, and
        //                 THAT component owns the Working state
        // (onMutate is the third, counted below: the result shows on the click.)
        if (new RegExp(`\\b${n}\\.is(Pending|Loading)\\b`).test(src)) return false
        if (new RegExp(`\\b${n}\\.mutateAsync\\b`).test(src)) return false
        return true
      }).length
      return Math.max(0, silent - optimistic)
    },
    mode: "max",
    hint: "This mutation's `isPending` is never read — the click has no Working state. Feed it to <Button loading> (which keeps the label, the focus and the colour), or mark the row optimistically in onMutate.",
  },
  {
    name: "disabledOnPending",
    exts: [".tsx"],
    exclude: ["components/ui/"],
    // Busy is not disabled. `disabled` drops the control out of the tab order
    // mid-action, so a keyboard user loses their place, and it paints the
    // control with the UNAVAILABLE styling — working and broken look the same.
    pattern: /disabled=\{[^}]*\bis(Pending|Loading)\b[^}]*\}/g,
    mode: "max",
    hint: "Pass the flag to <Button loading> instead of `disabled`. Busy keeps focus and colour, states itself with aria-busy, and refuses the second click in JS.",
  },
  {
    name: "rawButtonElement",
    exts: [".tsx"],
    // components/ui/ is the primitive itself; mobile/redesign/ is the mobile
    // design system, which has its own press layer (`mm-press-*`).
    exclude: ["components/ui/", "mobile/redesign/"],
    pattern: /<button[\s>]/g,
    mode: "max",
    hint: "Use <Button> from @/components/ui/button. It owns the press stamp, the busy state, the disabled paint and the focus ring; a raw <button> re-rolls all four and usually gets the busy one wrong.",
  },
  {
    name: "busyLabelThreeDots",
    exts: [".tsx"],
    // "Saving..." and "Saving…" both shipped, seventeen of one and five of the
    // other. One ellipsis character, so a busy label is one string everywhere.
    pattern: /"[A-Z][a-z]+ing\b[A-Za-z ]*\.\.\."/g,
    mode: "max",
    hint: "Busy labels use one ellipsis character (…), never three periods — and read as the verb in progress: Save → Saving…, Book the call → Booking….",
  },
  {
    name: "labelReplacedByEllipsis",
    exts: [".tsx"],
    exclude: ["components/ui/"],
    // The sibling rule above polices HOW a busy label is spelled. This one
    // polices whether there is a label at all. `{busy ? "…" : "Save"}` deletes
    // the word for what is happening at the exact moment the reader needs it,
    // and resizes the control while they read it — the defect the four-beats
    // pass removed from <Button>, then found hand-rolled at six call sites
    // that the spelling rule could not see, because it matches "Saving..."
    // inside a word and a bare ellipsis is not a word.
    //
    // The second half of the pattern is load-bearing: the OTHER branch must be
    // a non-empty string, i.e. an actual label that the ellipsis replaces.
    // Without it the rule also fires on `len > 10 ? "…" : ""` (truncation —
    // the ellipsis means "this text continues") and on a stat cell whose
    // pending value is an ellipsis because there is no word there to delete.
    pattern: /\?\s*"[.…]{1,3}"\s*:\s*"[^"]+"/g,
    mode: "max",
    hint: "Keep the label and pass the flag to <Button loading> — it holds the word, the focus and the colour, and refuses the second click. A raw button keeps its label too and says the verb in progress: Add → Adding….",
  },
  {
    name: "internalHrefAnchor",
    exts: [".tsx"],
    // A raw <a> to an in-app route throws the whole application away and
    // rebuilds it: re-auth, re-hydrate, refetch the page the reader was
    // already looking at. It is the single most expensive thing a press can
    // cost, and it is invisible in every server-side latency number we keep.
    // Three of these were fixed by hand and no rule was left behind, so nine
    // more were sitting in the tree a week later — including the gap chip on
    // the jobs feed, the busiest find-a-job surface in the product.
    count: (src) => {
      let n = 0
      for (const m of src.matchAll(/<a\b/g)) {
        const close = src.indexOf(">", m.index)
        if (close === -1) continue
        const tag = src.slice(m.index, close + 1)
        // Only in-app routes. An absolute URL or a mailto: is a real anchor.
        if (!/href=(?:"\/|\{"\/|\{`\/)/.test(tag)) continue
        // Two honest anchors: a new tab, and a file the browser must fetch.
        if (/target\s*=/.test(tag)) continue
        if (/\bdownload\b/.test(tag)) continue
        n++
      }
      return n
    },
    mode: "max",
    hint: "Use <Link> from next/link for an in-app route — it keeps the app alive and the click costs a render, not a reload. A raw <a> is correct only when it leaves the app, opens a new tab, or downloads a file.",
  },
]

function walk(dir, exts, acc) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, exts, acc)
    else if (exts.includes(extname(entry))) acc.push(full)
  }
  return acc
}

function countMetric(metric) {
  const files = metric.file
    ? [join(ROOT, metric.file)]
    : SRC_DIRS.flatMap((d) => walk(join(ROOT, d), metric.exts, []))
  let total = 0
  const offenders = []
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1)
    if ((metric.exclude ?? []).some((ex) => rel.includes(ex))) continue
    let content
    try {
      content = readFileSync(f, "utf8")
    } catch {
      continue
    }
    if (metric.transform) content = metric.transform(content)
    // A documented exemption, one per instance, written where the reader of
    // that line needs it: `// drift-ok(metricName): why this one is correct`.
    // A ratchet with no way to say "this instance is right" gets satisfied by
    // contorting the code instead, which is worse than the drift.
    const exempt = (
      content.match(new RegExp(`drift-ok\\(${metric.name}\\)`, "g")) ?? []
    ).length
    // A metric whose rule cannot be written as one regex (it has to relate two
    // things in the same file) supplies `count` instead of `pattern`.
    if (metric.count) {
      const n = Math.max(0, metric.count(content) - exempt)
      if (n > 0) {
        total += n
        offenders.push({ rel, n })
      }
      continue
    }
    const matches = content.match(metric.pattern)
    const n = Math.max(0, (matches?.length ?? 0) - exempt)
    if (n > 0) {
      total += n
      offenders.push({ rel, n })
    }
  }
  offenders.sort((a, b) => b.n - a.n)
  return { total, offenders }
}

/**
 * "One website" coverage: every public top-level page must be declared in the
 * site-route registry (lib/site-routes.ts) so it flows into nav/footer/sitemap.
 * A public app/<seg>/page.tsx with no `route: true` entry there fails the build
 * — a page can't be silently forgotten (the /companies-in-footer bug class).
 */
const NON_PUBLIC_SEGMENTS = new Set(["dashboard", "dev", "diary", "login", "offline", "onboarding", "signup", "welcome"])

function registeredRouteSegments() {
  const segs = new Set()
  let txt
  try {
    txt = readFileSync(join(ROOT, "lib", "site-routes.ts"), "utf8")
  } catch {
    return segs
  }
  for (const line of txt.split("\n")) {
    if (!/route:\s*true/.test(line)) continue
    const m = line.match(/path:\s*["'`]\/([^"'`/#]+)/)
    if (m) segs.add(m[1])
  }
  return segs
}

function checkRouteCoverage() {
  const registered = registeredRouteSegments()
  const appDir = join(ROOT, "app")
  const unregistered = []
  let entries
  try {
    entries = readdirSync(appDir)
  } catch {
    return []
  }
  for (const entry of entries) {
    if (entry.startsWith("(") || entry.startsWith("[") || entry === "api") continue
    if (NON_PUBLIC_SEGMENTS.has(entry)) continue
    if (!existsSync(join(appDir, entry, "page.tsx"))) continue
    if (!registered.has(entry)) unregistered.push(entry)
  }
  return unregistered
}

/**
 * A `var(--tm-*)` naming a token nothing defines.
 *
 * CSS fails these SILENTLY: `border: 1px solid var(--tm-hairline)` on an
 * undefined token computes to width 0 and the border simply is not there. No
 * error, no warning, nothing in the console — the rule just does not exist.
 *
 * `--tm-hairline` was never a token. Three rules named it: the say band's
 * separator, the CV tailor's, and the ENTIRE border of Myro Search's four topic
 * chips, which had therefore been rendering as bare text. It survived a
 * redesign of that surface because a plausible token name reads as correct in
 * a diff, and the screenshot of chips-without-borders reads as a design choice.
 */
function undefinedTokens() {
  const tokensCss = readFileSync(join(ROOT, "app", "design-tokens.css"), "utf8")
  const defined = new Set([...tokensCss.matchAll(/(--tm-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
  const missing = []
  for (const file of SRC_DIRS.flatMap((d) => walk(join(ROOT, d), [".css"], []))) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    const seen = new Set()
    for (const [, name] of css.matchAll(/var\(\s*(--tm-[a-z0-9-]+)/g)) {
      // A fallback is a deliberate "may not exist" and carries its own value.
      if (defined.has(name) || seen.has(name)) continue
      if (new RegExp(`var\\(\\s*${name}\\s*,`).test(css)) continue
      seen.add(name)
      missing.push(`${relative(ROOT, file)} → ${name}`)
    }
  }
  return missing
}

const missingTokens = undefinedTokens()

const update = process.argv.includes("--update-baseline")
const results = METRICS.map((m) => ({ metric: m, ...countMetric(m) }))

if (update) {
  const baseline = {}
  for (const r of results) baseline[r.metric.name] = r.total
  baseline.definedTokensOnly = missingTokens.length
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n")
  console.log("Updated UI drift baseline:")
  for (const r of results) console.log(`  ${r.metric.name}: ${r.total}`)
  process.exit(0)
}

let baseline = {}
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
} catch {
  console.error(`No baseline at ${BASELINE_PATH}. Run: npm run check:ui-drift -- --update-baseline`)
  process.exit(1)
}

const violations = []
for (const r of results) {
  const base = baseline[r.metric.name]
  if (base === undefined) {
    violations.push({ r, kind: "missing-baseline" })
    continue
  }
  if (r.metric.mode === "max" && r.total > base) violations.push({ r, base, kind: "increased" })
  if (r.metric.mode === "min" && r.total < base) violations.push({ r, base, kind: "decreased" })
}

const unregistered = checkRouteCoverage()

// A RATCHET, like every other metric here — seven of these predate the check,
// in five files across surfaces this session has no business repainting blind.
// Guessing which token each MEANT would change how those screens look with no
// way to verify it. So the number may only fall, and the offenders are printed
// every run rather than hidden behind a green tick.
const tokenBase = baseline.definedTokensOnly
const tokensWorse = tokenBase === undefined || missingTokens.length > tokenBase

console.log("UI drift guard:")
for (const r of results) {
  const base = baseline[r.metric.name]
  const arrow = r.metric.mode === "max" ? "≤" : "≥"
  console.log(`  ${r.metric.name}: ${r.total} (${arrow} ${base ?? "?"})`)
}
console.log(`  publicRouteCoverage: ${unregistered.length === 0 ? "ok" : `${unregistered.length} unregistered`}`)
console.log(`  definedTokensOnly: ${missingTokens.length} (≤ ${tokenBase ?? "?"})`)
for (const m of missingTokens) console.log(`      ${m}`)

if (violations.length === 0 && unregistered.length === 0 && !tokensWorse) {
  console.log("\n✓ No new UI drift.")
  process.exit(0)
}

console.error("\n✗ UI drift gate failed:\n")
for (const v of violations) {
  const { r } = v
  if (v.kind === "missing-baseline") {
    console.error(`  ${r.metric.name}: no baseline entry — run --update-baseline.`)
    continue
  }
  if (v.kind === "increased") {
    console.error(`  ${r.metric.name}: ${v.base} → ${r.total} (new hand-rolled copy added).`)
  } else {
    console.error(`  ${r.metric.name}: ${v.base} → ${r.total} (canonical usage dropped).`)
  }
  console.error(`    ${r.metric.hint}`)
  console.error(`    current locations: ${r.offenders.map((o) => `${o.rel}(${o.n})`).join(", ") || "—"}`)
  console.error("")
}
if (tokensWorse) {
  console.error(`  definedTokensOnly: ${tokenBase ?? "no baseline"} → ${missingTokens.length}`)
  console.error("    A var(--tm-*) naming a token nothing defines. CSS fails this SILENTLY:")
  console.error("    the declaration is dropped and the rule is simply absent — no error, no warning.")
  for (const m of missingTokens) console.error(`      ${m}`)
  console.error("    Define it in app/design-tokens.css, use an existing token, or give it a fallback.\n")
}
if (unregistered.length > 0) {
  console.error(`  publicRouteCoverage: ${unregistered.map((s) => `/${s}`).join(", ")} not in the site-route registry.`)
  console.error("    Add an entry (with `route: true`) in lib/site-routes.ts so the page flows into nav/footer/sitemap.")
  console.error("    If it's not a public surface, add its segment to NON_PUBLIC_SEGMENTS in this script.\n")
}
if (violations.length > 0) {
  console.error("If you intentionally REDUCED a hand-rolled pattern, lock it in:")
  console.error("  npm run check:ui-drift -- --update-baseline\n")
}
process.exit(1)
