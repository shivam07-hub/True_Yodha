#!/usr/bin/env python
"""
Mobile render gate — the check that looks at the app.

Why this exists
---------------
For months every automated check was green while the mobile app shipped
near-black headings on a near-black page. `tsc` reads types. `eslint` reads
syntax. `ui-drift-guard` reads file contents. None of them RENDER anything, so
none of them could see that `.tm-main-scroll` painted a dark canvas under
light-mode text tokens. A human screenshot found it in one look.

So this gate renders the real app, in a real authed session, at 375px, in BOTH
themes — and then ASSERTS rather than merely capturing. Screenshots that a
human has to remember to review are not a gate; they are homework.

Five probes, each one earned by a bug that shipped:

  contrast     a heading must clear WCAG AA against the background it is REALLY
               painted on (walk ancestors past transparent fills, don't guess)
  squeeze      a leaf whose line count approaches its word count is a starved
               column
  unreachable  a control or panel cut off by a NON-scrollable ancestor, or past
               the viewport with nothing clipping it. scrollWidth reads a clean
               375 while a nav tab sits 143px off the right edge, so it can
               never be the probe
  tap          WCAG 2.2 AA 2.5.8 — a pointer target below 24x24 CSS px

Credentials
-----------
Read from frontend/.env.local (MYRO_TEST_EMAIL / MYRO_TEST_PASSWORD). They are
never printed, logged, or written into output. Use a dedicated seeded QA
account, never a real user's.

Usage
-----
    npm run qa:mobile                     # from frontend/
    python scripts/qa-mobile-capture.py --base-url http://localhost:3000
    python scripts/qa-mobile-capture.py --themes dark   # single theme
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import urllib.error
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[1]
ENV_FILE = REPO / "frontend" / ".env.local"

# Every route a phone can actually reach: the 4-tab nav, its children, the
# top-bar actions, everything the Profile list links to, and the public pages
# those links land on. Add a route here the day it becomes reachable — /tokens
# was uncovered, which is why the worst layout break of the 2026-07 pass was
# invisible to automation, and the 2026-08 sweep found five more the same way.
#
# The public entries matter as much as the authed ones: a logged-in phone user
# who taps Newsletter or Myrology from /me leaves the mobile shell entirely and
# lands on the shared desktop chrome.
SURFACES = [
    # 4-tab nav
    ("market", "/market"),
    ("collections", "/collections"),
    ("cv", "/cv"),
    ("preparations", "/preparations"),
    # CV tab children
    ("cv-tailor", "/cv/tailor"),
    ("cv-reservoir", "/cv/reservoir"),
    ("notebook", "/notebook"),
    # top-bar actions + profile
    ("practice", "/practice"),
    ("me", "/me"),
    ("skills", "/skills"),
    ("tokens", "/tokens"),
    # the funnel: skill confirmation is the stage-one gate
    ("onboarding-result", "/onboarding/result"),
    # reachable from /me and the feedback hub
    ("beta-feedback", "/beta-feedback"),
    ("mission", "/mission"),
    ("job-switch-plan", "/job-switch-plan"),
    # public routes the app links out to — same chrome, no bottom nav
    ("intel", "/intel"),
    ("newsletter", "/newsletter"),
    ("myrology", "/myrology"),
    ("companies", "/companies"),
    ("taxonomy", "/taxonomy"),
]

# WCAG AA. Large text (>=24px, or >=18.66px bold) may sit at 3:1; everything
# else needs 4.5:1. A heading that fails this is invisible, full stop.
AA_NORMAL = 4.5
AA_LARGE = 3.0


def load_env() -> dict[str, str]:
    if not ENV_FILE.exists():
        sys.exit(f"missing {ENV_FILE} — copy frontend/.env.example and fill it in")
    env: dict[str, str] = {}
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def preflight(base_url: str, env: dict[str, str]) -> None:
    """Fail fast, loudly, with the fix — instead of timing out on a form.

    Both checks here encode a debugging session that should never repeat.
    """
    # 1. Dev server up AND serving real JS. A stale .next reports "Ready" in
    #    ~1s then serves text/html 404s for /_next/static chunks, so the page
    #    never hydrates and every click silently does nothing.
    try:
        with urllib.request.urlopen(f"{base_url}/login", timeout=15) as r:
            html = r.read().decode("utf-8", "replace")
    except Exception as e:
        sys.exit(f"PREFLIGHT: dev server not reachable at {base_url} ({e}).\n"
                 f"  fix: cd frontend && npm run dev")

    chunk = None
    for marker in ('/_next/static/chunks/main-app.js', '/_next/static/chunks/main-app'):
        i = html.find(marker)
        if i != -1:
            chunk = html[i:html.find('"', i)]
            break
    if chunk:
        try:
            with urllib.request.urlopen(f"{base_url}{chunk}", timeout=15) as r:
                ctype = r.headers.get("content-type", "")
        except urllib.error.HTTPError as e:
            ctype = f"HTTP {e.code}"
        if "javascript" not in ctype:
            sys.exit(f"PREFLIGHT: {chunk} served as '{ctype}', not JavaScript.\n"
                     f"  The build is stale, so the app will never hydrate and no\n"
                     f"  click will register.\n"
                     f"  fix: cd frontend && rm -rf .next && npm run dev")

    # 2. The API the login actually posts to. Pointing at localhost:8000 with no
    #    uvicorn running yields a bare "Network request failed" in the UI.
    api = env.get("NEXT_PUBLIC_API_URL", "")
    if not api:
        sys.exit("PREFLIGHT: NEXT_PUBLIC_API_URL is unset in frontend/.env.local")
    try:
        req = urllib.request.Request(f"{api}/health", method="GET")
        urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError:
        pass  # any HTTP status means something is listening — good enough
    except Exception as e:
        sys.exit(f"PREFLIGHT: API at {api} is unreachable ({e}).\n"
                 f"  Login will fail with a bare 'Network request failed'.\n"
                 f"  fix: point NEXT_PUBLIC_API_URL at the dev backend\n"
                 f"       (https://truemirror.up.railway.app), or start uvicorn.")

    for key in ("MYRO_TEST_EMAIL", "MYRO_TEST_PASSWORD"):
        if not env.get(key):
            sys.exit(f"PREFLIGHT: {key} missing from frontend/.env.local "
                     f"(see frontend/.env.example)")


# Injected into the page: find every visible heading, resolve the background it
# is REALLY painted on by walking ancestors past transparent fills, and return
# the contrast. Doing this in the page (not on the screenshot) means the gate
# reports the offending selector, not just "looks wrong".
CONTRAST_PROBE = r"""
() => {
  const lum = (r, g, b) => {
    const f = c => { c /= 255; return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4) }
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b)
  }
  const parse = s => {
    const m = (s || '').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
    return m ? { r:+m[1], g:+m[2], b:+m[3], a: m[4] === undefined ? 1 : +m[4] } : null
  }
  // First ancestor with a non-transparent background = what you actually see.
  const effectiveBg = el => {
    let n = el
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0.5) return c
      n = n.parentElement
    }
    const c = parse(getComputedStyle(document.documentElement).backgroundColor)
    return c && c.a > 0.5 ? c : { r:255, g:255, b:255, a:1 }
  }
  const out = []
  for (const el of document.querySelectorAll('h1, h2, h3')) {
    const text = (el.innerText || '').trim()
    if (!text) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.1) continue
    const fg = parse(cs.color); if (!fg) continue
    const bg = effectiveBg(el)
    const L1 = lum(fg.r, fg.g, fg.b), L2 = lum(bg.r, bg.g, bg.b)
    const ratio = (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05)
    const size = parseFloat(cs.fontSize)
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700
    out.push({
      tag: el.tagName.toLowerCase(),
      text: text.slice(0, 44).replace(/\s+/g, ' '),
      ratio: Math.round(ratio * 100) / 100,
      large: size >= 24 || (size >= 18.66 && bold),
      color: cs.color,
      bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
    })
  }
  return out
}
"""


# A column starved to a few characters wraps multi-word text one word per line.
# Detect it structurally: line count approaching word count. Catches the whole
# family (any nowrap/auto sibling starving a minmax(0,1fr) column), not just the
# coin-guide instance that prompted it.
SQUEEZE_PROBE = r"""
() => {
  const out = []
  for (const el of document.querySelectorAll('div, p, span, li, h1, h2, h3, a')) {
    // Leaf text nodes only — a wrapper's height is its children's, not its text.
    if (el.children.length > 0) continue
    const text = (el.innerText || '').trim()
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length < 4) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    let lh = parseFloat(cs.lineHeight)
    if (!isFinite(lh)) lh = parseFloat(cs.fontSize) * 1.2
    if (!isFinite(lh) || lh <= 0) continue
    const lines = Math.round(rect.height / lh)
    if (lines < 3) continue
    // >=80% as many lines as words means roughly one word per line.
    if (lines >= words.length * 0.8) {
      out.push({
        text: text.slice(0, 48).replace(/\s+/g, ' '),
        lines, words: words.length,
        width: Math.round(rect.width),
      })
    }
  }
  return out
}
"""


# Content that is on the page but not on the screen.
#
# `document.documentElement.scrollWidth` is NOT a probe for this: on /myrology
# and every public route it reads a clean 375 while a nav tab sits 143px past
# the viewport, because an ancestor CLIPS instead of scrolling. Nothing throws,
# nothing scrolls sideways, and the page looks fine to every assertion that
# asks the document how wide it is. So measure each element's own rect against
# whatever actually confines it.
#
# Two things are legitimately cut and must not fire:
#   - anything inside a SCROLLABLE clipper — the user can reach it
#   - a marquee/ticker, which is a track wider than its window ON PURPOSE;
#     those loop forever, so an INFINITE animation between the element and its
#     clipper is the tell (a one-shot entrance reveal is not — keying on "has
#     an animation" hid three clipped nav tabs behind the nav's 0.42s reveal)
# Everything else that is cut is either a control nobody can tap or a panel
# nobody can read.
UNREACHABLE_PROBE = r"""
({ TEXT_CUT_RATIO }) => {
  const INTERACTIVE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'])
  const isInteractive = el =>
    INTERACTIVE.has(el.tagName) || ['button', 'tab', 'checkbox', 'switch', 'link'].includes(el.getAttribute('role'))
  // The cut measured here is HORIZONTAL, so only horizontal scrolling makes it
  // reachable. `body { overflow-x: hidden; overflow-y: auto }` is the common
  // shape, and treating "scrolls on either axis" as reachable hid a whole
  // pricing panel that sits 101px off the right edge of /myrology.
  const scrollableX = cs => ['auto', 'scroll'].includes(cs.overflowX)
  const name = el =>
    el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : '')

  const W = window.innerWidth
  const hits = [], reported = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.1) continue

    // Walk to the nearest clipper, watching for an animation on the way.
    const loops = c => c.animationName !== 'none' && c.animationIterationCount.includes('infinite')
    let n = el, clipper = null, animated = loops(cs)
    while (n && n !== document.documentElement) {
      const ncs = getComputedStyle(n)
      if (n !== el) {
        if (loops(ncs)) animated = true
        if (ncs.overflowX !== 'visible' || ncs.overflowY !== 'visible') { clipper = n; break }
      }
      n = n.parentElement
    }
    if (animated) continue                       // marquee / ticker, by design
    if (clipper && scrollableX(getComputedStyle(clipper))) continue

    const bound = clipper ? clipper.getBoundingClientRect() : { left: 0, right: W }
    const cut = Math.round(Math.max(r.right - bound.right, bound.left - r.left))
    if (cut <= 2) continue

    // Own text only — a wrapper inherits its children's and would double-report.
    const ownText = Array.from(el.childNodes)
      .filter(k => k.nodeType === 3).map(k => k.textContent).join(' ').trim()
    const interactive = isInteractive(el)
    if (!interactive && (ownText.length < 8 || cut < r.width * TEXT_CUT_RATIO)) continue

    if (reported.some(a => a.contains(el))) continue   // outermost offender wins
    reported.push(el)
    hits.push({
      sel: name(el),
      cut,
      by: clipper ? name(clipper) : 'the viewport',
      kind: interactive ? 'control' : 'content',
      text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36),
    })
  }
  return hits.slice(0, 8)
}
"""

# A panel is only "unreachable" once most of it is gone; a control is
# unreachable the moment it is cut at all.
TEXT_CUT_RATIO = 0.4


# Does the page agree with the theme it was asked for?
#
# The contrast probe cannot catch this: black text on a white card clears AA
# beautifully — while the top bar and the bottom nav around it stay dark,
# because the surface pinned its own hexes instead of reading tokens. That is
# the exact shape of the 2026-07 bug this whole gate exists for (background
# owner and text-token owner differ, nothing checks they agree), and it is
# still live on /beta-feedback, which pins `background: #eef0eb`.
#
# So resolve what the main content is REALLY painted on and check it against
# the theme, rather than trusting that a surface opted into the token system.
# Surfaces that pin a theme on purpose (backlog #28: myrology is a deliberate
# dark island, joined at `:root, .myrology-root`). Declaring them here is the
# point — an undeclared surface that paints its own colours is drift, and a
# declared one still has to clear the contrast probe inside its own theme.
PINNED_SURFACE = {"myrology": "dark"}

THEME_PROBE = r"""
({ theme }) => {
  const parse = s => {
    const m = (s || '').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
    return m ? { r:+m[1], g:+m[2], b:+m[3], a: m[4] === undefined ? 1 : +m[4] } : null
  }
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4) }
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b)
  }
  // Walk DOWN, not up. `.tm-main-scroll` is the shell's own canvas and always
  // carries the right colour; the surface that pinned its own hexes is a child
  // painting ON TOP of it. So sample what is actually under the pixels a
  // reader looks at, and let the majority answer.
  const effectiveBg = el => {
    let n = el
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0.5) return { c, n }
      n = n.parentElement
    }
    const c = parse(getComputedStyle(document.documentElement).backgroundColor)
    return c ? { c, n: document.documentElement } : null
  }

  const W = window.innerWidth, H = window.innerHeight
  const tally = new Map()
  for (let i = 1; i <= 8; i++) {
    const y = Math.round(H * i / 9)
    const hit = document.elementFromPoint(Math.round(W / 2), y)
    if (!hit) continue
    const eff = effectiveBg(hit)
    if (!eff) continue
    const key = `${eff.c.r},${eff.c.g},${eff.c.b}`
    const prev = tally.get(key) || { n: 0, c: eff.c, el: eff.n }
    prev.n++
    tally.set(key, prev)
  }
  if (!tally.size) return null
  const top = [...tally.values()].sort((a, b) => b.n - a.n)[0]
  const L = lum(top.c)
  // Dark canonical is #191918 (L~0.010); light paper is #faf6f0 (L~0.93). The
  // gap is enormous, so 0.5 separates them with room to spare either way.
  const paintedDark = L < 0.5
  const wantDark = theme === 'dark'
  if (paintedDark === wantDark) return null
  const el = top.el
  return {
    canvas: `rgb(${top.c.r}, ${top.c.g}, ${top.c.b})`,
    painted: paintedDark ? 'dark' : 'light',
    share: `${top.n}/8 samples`,
    sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''),
  }
}
"""


# WCAG 2.2 AA 2.5.8 — a pointer target must be at least 24x24 CSS px. The spec's
# own exception is inline targets inside a sentence, so anchors that compute to
# `display: inline` are skipped; a checkbox, a button, or a block link has no
# excuse. The 24px line is the hard standard and fails the gate. Apple asks for
# 44 and Android for 48dp: everything between 24 and 44 is counted and reported
# as one summary line rather than dozens of entries nobody reads.
TAP_MIN_AA = 24

TAP_PROBE = r"""
({ AA }) => {
  const INTERACTIVE = 'a, button, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], input, select'
  const fails = []
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.1) continue
    if (el.tagName === 'A' && cs.display === 'inline') continue   // 2.5.8 inline exception
    if (el.disabled) continue
    const w = Math.round(r.width), h = Math.round(r.height)
    const label = (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 26)
    if (w < AA || h < AA) {
      fails.push({
        sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''),
        w, h, label,
      })
    }
  }
  return { fails: fails.slice(0, 8) }
}
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:3000")
    ap.add_argument("--out", default=str(REPO / "frontend" / ".qa-shots"))
    ap.add_argument("--themes", default="dark,light")
    ap.add_argument("--no-shots", action="store_true")
    args = ap.parse_args()

    env = load_env()
    preflight(args.base_url, env)
    print(f"preflight ok — {args.base_url}, api={env['NEXT_PUBLIC_API_URL']}")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("playwright missing.\n  fix: pip install playwright && playwright install chromium")

    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    checked = 0

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for theme in [t.strip() for t in args.themes.split(",") if t.strip()]:
            ctx = browser.new_context(
                viewport={"width": 375, "height": 812}, device_scale_factor=2,
                color_scheme=theme, is_mobile=True, has_touch=True,
            )
            page = ctx.new_page()
            page.set_default_timeout(30000)

            page.goto(f"{args.base_url}/login", wait_until="networkidle")
            page.wait_for_timeout(2500)  # the form is "use client"
            try:
                # Form opens in magic-link mode; flip it to password.
                page.get_by_role("button", name="Prefer a password?").click()
                page.wait_for_selector("input[type=password]", timeout=10000)
                page.fill("input[type=email]", env["MYRO_TEST_EMAIL"])
                page.fill("input[type=password]", env["MYRO_TEST_PASSWORD"])
                page.click("button[type=submit]")
                page.wait_for_url(lambda u: "/login" not in u, timeout=45000)
                page.wait_for_timeout(2500)
            except Exception as e:
                if not args.no_shots:
                    page.screenshot(path=str(out_dir / f"{theme}__LOGIN-FAILED.png"))
                failures.append(f"{theme}: login failed ({type(e).__name__}) — "
                                f"see {theme}__LOGIN-FAILED.png")
                ctx.close()
                continue

            for name, path in SURFACES:
                try:
                    page.goto(f"{args.base_url}{path}", wait_until="domcontentloaded")
                    page.wait_for_timeout(6000)  # let the client waterfall settle
                    if not args.no_shots:
                        page.screenshot(path=str(out_dir / f"{theme}__{name}.png"))
                    for h in page.evaluate(CONTRAST_PROBE):
                        checked += 1
                        need = AA_LARGE if h["large"] else AA_NORMAL
                        if h["ratio"] < need:
                            failures.append(
                                f"{theme}/{name}: <{h['tag']}> \"{h['text']}\" "
                                f"{h['ratio']}:1 (needs {need}:1) "
                                f"color={h['color']} on {h['bg']}"
                            )
                    for s in page.evaluate(SQUEEZE_PROBE):
                        failures.append(
                            f"{theme}/{name}: squeezed column — \"{s['text']}\" "
                            f"wraps to {s['lines']} lines for {s['words']} words "
                            f"in {s['width']}px"
                        )
                    want = PINNED_SURFACE.get(name, theme)
                    off = page.evaluate(THEME_PROBE, {"theme": want})
                    if off:
                        failures.append(
                            f"{theme}/{name}: canvas is painted {off['painted']} "
                            f"where {want} was expected ({off['share']}) — "
                            f"{off['sel']} is {off['canvas']}. The surface is "
                            f"pinning its own colours instead of reading "
                            f"[data-surface] tokens."
                        )
                    for u in page.evaluate(UNREACHABLE_PROBE,
                                           {"TEXT_CUT_RATIO": TEXT_CUT_RATIO}):
                        failures.append(
                            f"{theme}/{name}: {u['kind']} cut {u['cut']}px by {u['by']} "
                            f"(no scroll) — {u['sel']} \"{u['text']}\""
                        )
                    tap = page.evaluate(TAP_PROBE, {"AA": TAP_MIN_AA})
                    for t in tap["fails"]:
                        failures.append(
                            f"{theme}/{name}: tap target {t['w']}x{t['h']}px "
                            f"(WCAG 2.5.8 needs {TAP_MIN_AA}x{TAP_MIN_AA}) — "
                            f"{t['sel']} \"{t['label']}\""
                        )
                except Exception as e:
                    failures.append(f"{theme}/{name}: {type(e).__name__} {str(e)[:90]}")
            ctx.close()
        browser.close()

    print(f"\nchecked {checked} headings across {len(SURFACES)} surfaces × "
          f"{len(args.themes.split(','))} themes")
    if not args.no_shots:
        print(f"screenshots: {out_dir}")
    if failures:
        print(f"\n✗ {len(failures)} FAILURE(S) — a heading nobody can read is a bug:\n")
        for f in failures:
            print(f"  {f}")
        return 1
    print("\n✓ every heading clears WCAG AA against the background it is really painted on")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
