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
human has to remember to review are not a gate; they are homework. The check
that matters is: does every heading actually contrast against the background it
is really painted on?

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

# Authed surfaces reachable from the 4-tab mobile nav, plus the satellites the
# nav can reach. Add a route here the day you add it to the nav.
SURFACES = [
    ("market", "/market"),
    ("collections", "/collections"),
    ("cv", "/cv"),
    ("preparations", "/preparations"),
    ("skills", "/skills"),
    ("me", "/me"),
    ("intel", "/intel"),
    ("tokens", "/tokens"),
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
