#!/usr/bin/env python3
"""Render a Myro newsletter carousel + OG card from a JSON spec.

    python3 scripts/build-newsletter-carousel.py scripts/newsletter-carousel-specs/issue-0XX.json

Slides render at 1080x1350 (Instagram 4:5, safe on LinkedIn). The OG card
renders at 1200x630. Both at 2x. Brand fonts are embedded from
frontend/app/fonts so the output does not depend on system fonts.

Spec shape:
  {"issue": 18, "out": "Myro Newsletter/Issue 018 - carousel",
   "og_out": "frontend/public/newsletter/issue-018-og.png",
   "foot": "14,851 openings · 217 employers · 8 Aug 2026",
   "og": {"h1": "...", "bars": [["Label", 44.1, "44.1%"], ...], "max": 45,
          "dim_from": 4, "foot": "..."},
   "slides": [{"kind": "statement", "h1": "...", "sub": "...", "foot": "..."},
              {"kind": "number", "kicker": "...", "huge": "47.8%", "sub": "..."},
              {"kind": "bars", "kicker": "...", "bars": [...], "max": 45,
               "cliff_after": 3, "dim_from": 4, "note": "..."},
              {"kind": "table", "kicker": "...", "head": ["a","b"],
               "rows": [["Engineering","47.8%",true], ...], "note": "..."},
              {"kind": "cards", "kicker": "...",
               "cards": [["Early · 0-3 yrs", "..."], ...]},
              {"kind": "cta", "h1": "...", "sub": "...", "pill": "himyro.com →"}]}
"""
import base64, json, pathlib, sys, html

ROOT = pathlib.Path("/Users/incognito/True_Yodha")
FONTS = ROOT / "frontend" / "app" / "fonts"
W, H = 1080, 1350


def _font(name):
    return base64.b64encode((FONTS / name).read_bytes()).decode()


def css(w, h):
    return """
@font-face { font-family:'Geist'; src:url(data:font/woff;base64,%s) format('woff');
  font-weight:100 900; font-display:block; }
@font-face { font-family:'GeistMono'; src:url(data:font/woff;base64,%s) format('woff');
  font-weight:100 900; font-display:block; }
* { margin:0; padding:0; box-sizing:border-box; }
:root { --bg:#191918; --surface:#212120; --fg:#F2F0EC; --muted:#8C867E;
  --mint:hsl(172 100%% 48%%); --mint-dim:hsl(172 60%% 30%%);
  --amber:hsl(35 100%% 64%%); --border:hsl(30 16%% 17%%); }
body { margin:0; background:var(--bg); font-family:'Geist',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased; }
.slide { width:%dpx; height:%dpx; background:var(--bg); color:var(--fg);
  padding:88px 80px 72px; display:flex; flex-direction:column; position:relative;
  overflow:hidden; }
.slide::after { content:''; position:absolute; inset:0;
  background:radial-gradient(120%% 80%% at 92%% 4%%, hsl(172 100%% 48%% / .10), transparent 58%%);
  pointer-events:none; }
.rail { display:flex; align-items:center; justify-content:space-between;
  font-family:'GeistMono',monospace; font-size:23px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--muted); margin-bottom:52px; z-index:1; }
.rail .mark { display:flex; align-items:center; gap:14px; color:var(--fg); }
.dot { width:26px; height:26px; border-radius:50%%; border:3px solid var(--mint);
  position:relative; }
.dot::after { content:''; position:absolute; inset:5px; border-radius:50%%;
  background:var(--mint); }
.body { flex:1; display:flex; flex-direction:column; justify-content:center; z-index:1; }
h1 { font-size:78px; line-height:1.05; font-weight:640; letter-spacing:-.028em; }
h2 { font-size:56px; line-height:1.12; font-weight:620; letter-spacing:-.02em; }
.kicker { font-family:'GeistMono',monospace; font-size:28px; letter-spacing:.18em;
  text-transform:uppercase; color:var(--mint); margin-bottom:14px; font-weight:500; }
/* The label owns the top of the block: a rule carries the eye down into the
   prose so the kicker reads as a heading rather than a caption stranded above
   a brighter line. */
.kicker::after { content:''; display:block; width:96px; height:2px;
  background:var(--mint); opacity:.45; margin-top:18px; }
.kicker + .prose, .kicker + .lead { margin-top:38px; }
.huge { font-size:250px; line-height:.86; font-weight:680; letter-spacing:-.045em;
  color:var(--mint); font-variant-numeric:tabular-nums; }
.sub { font-size:37px; line-height:1.4; color:var(--muted); margin-top:40px;
  font-weight:400; max-width:24ch; }
.sub strong { color:var(--fg); font-weight:560; }
.foot { font-family:'GeistMono',monospace; font-size:21px; letter-spacing:.1em;
  color:var(--muted); text-transform:uppercase; z-index:1; padding-top:40px; }
.row { display:grid; grid-template-columns:214px 1fr 128px; align-items:center;
  gap:22px; margin-bottom:19px; }
.row .city { font-size:32px; font-weight:520; }
.track { height:42px; background:var(--surface); border-radius:5px; overflow:hidden; }
.fill { height:100%%; background:var(--mint); border-radius:5px; }
.fill.dim { background:var(--mint-dim); }
.val { font-family:'GeistMono',monospace; font-size:31px; text-align:right;
  font-variant-numeric:tabular-nums; }
.cliff { display:flex; align-items:center; gap:20px; margin:26px 0 30px; }
.cliff .line { flex:1; height:2px; background:var(--border); }
.cliff .lbl { font-family:'GeistMono',monospace; font-size:22px; letter-spacing:.13em;
  color:var(--amber); text-transform:uppercase; }
table { width:100%%; border-collapse:collapse; }
td, th { text-align:left; padding:25px 0; border-bottom:1px solid var(--border);
  font-size:35px; }
th { font-family:'GeistMono',monospace; font-size:22px; letter-spacing:.13em;
  color:var(--muted); text-transform:uppercase; padding-bottom:18px; font-weight:400; }
td.n { text-align:right; font-family:'GeistMono',monospace;
  font-variant-numeric:tabular-nums; font-weight:560; }
td.hi { color:var(--mint); } td.lo { color:var(--muted); }
.card { background:var(--surface); border:1px solid var(--border); border-radius:18px;
  padding:36px 38px; margin-bottom:24px; }
.card .t { font-family:'GeistMono',monospace; font-size:23px; letter-spacing:.13em;
  text-transform:uppercase; color:var(--mint); margin-bottom:16px; }
.card .d { font-size:33px; line-height:1.38; color:var(--fg); font-weight:400; }
.cta { display:inline-block; background:var(--mint); color:#04241D; font-size:40px;
  font-weight:620; padding:30px 52px; border-radius:999px; letter-spacing:-.01em; }
.mtx td, .mtx th { padding:17px 8px; font-size:27px; border-bottom:1px solid var(--border); }
.mtx th.mx, .mtx td.mx { text-align:center; font-family:'GeistMono',monospace;
  font-variant-numeric:tabular-nums; }
.mtx th.mx { font-size:20px; letter-spacing:.06em; color:var(--muted); text-transform:uppercase; }
.mtx td.mxl, .mtx th.mxl { text-align:left; font-size:28px; font-weight:520; padding-right:16px; }
.mtx td.mx { color:var(--muted); }
.mtx td.mx.warm { color:var(--fg); background:hsl(172 100%% 48%% / .10); }
.mtx td.mx.hot { color:#04241D; background:var(--mint); font-weight:660; }
.prose { font-size:46px; line-height:1.32; font-weight:440; letter-spacing:-.014em;
  color:var(--fg); }
.prose b, .prose strong { font-weight:680; color:var(--fg); }
.prose .hl { font-weight:680; color:var(--mint); }
.lead { font-size:96px; line-height:1; font-weight:680; letter-spacing:-.04em;
  color:var(--mint); font-variant-numeric:tabular-nums; margin-bottom:34px; }
.note { font-size:29px; color:var(--muted); line-height:1.45; margin-top:34px; }
""" % (_font("GeistVF.woff"), _font("GeistMonoVF.woff"), w, h)


def bars_html(bars, maxv, cliff_after=None, dim_from=None):
    out = []
    for i, (label, val, disp) in enumerate(bars):
        cls = "fill dim" if (dim_from is not None and i >= dim_from) else "fill"
        out.append(
            f'<div class="row"><div class="city">{html.escape(label)}</div>'
            f'<div class="track"><div class="{cls}" style="width:{val/maxv*100:.1f}%"></div></div>'
            f'<div class="val">{disp}</div></div>')
        if cliff_after is not None and i == cliff_after:
            out.append('<div class="cliff"><div class="line"></div>'
                       '<div class="lbl">the cliff</div><div class="line"></div></div>')
    return "".join(out)


def slide_body(s):
    k = s.get("kind")
    kicker = f'<div class="kicker">{html.escape(s["kicker"])}</div>' if s.get("kicker") else ""
    if k == "statement":
        return (f'{kicker}<h1>{s["h1"]}</h1>'
                + (f'<div class="sub">{s["sub"]}</div>' if s.get("sub") else ""))
    if k == "number":
        return (f'{kicker}<div class="huge">{html.escape(s["huge"])}</div>'
                f'<div class="sub">{s["sub"]}</div>')
    if k == "bars":
        note = f'<div class="note">{s["note"]}</div>' if s.get("note") else ""
        return kicker + bars_html(s["bars"], s["max"], s.get("cliff_after"),
                                  s.get("dim_from")) + note
    if k == "table":
        head = "".join(f'<th{" style=\"text-align:right\"" if i else ""}>'
                       f'{html.escape(h)}</th>' for i, h in enumerate(s["head"]))
        rows = "".join(
            f'<tr><td>{html.escape(r[0])}</td>'
            f'<td class="n {"hi" if r[2] else "lo"}">{html.escape(r[1])}</td></tr>'
            for r in s["rows"])
        note = f'<div class="note">{s["note"]}</div>' if s.get("note") else ""
        return f'{kicker}<table><tr>{head}</tr>{rows}</table>{note}'
    if k == "cards":
        cards = "".join(f'<div class="card"><div class="t">{html.escape(t)}</div>'
                        f'<div class="d">{d}</div></div>' for t, d in s["cards"])
        return kicker + cards
    if k == "prose":
        lead = (f'<div class="lead">{s["lead"]}</div>' if s.get("lead") else "")
        return (f'{kicker}{lead}<div class="prose">{s["text"]}</div>')
    if k == "matrix":
        cols = "".join(f'<th class="mx">{html.escape(c)}</th>' for c in s["cols"])
        rows = ""
        for label, cells in s["rows"]:
            tds = ""
            for v, hot in cells:
                cls = "mx hot" if hot == 2 else ("mx warm" if hot == 1 else "mx")
                tds += f'<td class="{cls}">{html.escape(v)}</td>'
            rows += f'<tr><td class="mxl">{html.escape(label)}</td>{tds}</tr>'
        note = f'<div class="note">{s["note"]}</div>' if s.get("note") else ""
        return (f'{kicker}<table class="mtx"><tr><th class="mxl"></th>{cols}</tr>{rows}</table>{note}')
    if k == "cta":
        return (f'{kicker}<h2 style="max-width:18ch">{s["h1"]}</h2>'
                f'<div class="sub" style="margin-bottom:56px">{s["sub"]}</div>'
                f'<div><span class="cta">{html.escape(s["pill"])}</span></div>')
    raise ValueError(f"unknown slide kind: {k}")


def main(spec_path):
    from playwright.sync_api import sync_playwright
    spec = json.loads(pathlib.Path(spec_path).read_text())
    issue = spec["issue"]
    out = ROOT / spec["out"]; out.mkdir(parents=True, exist_ok=True)
    slides = spec["slides"]
    n = len(slides)

    def rail(i):
        return ('<div class="rail"><div class="mark"><span class="dot"></span>MYRO</div>'
                f'<div>{i:02d} / {n:02d}</div></div>')

    pages = "".join(
        f'<div class="slide" id="s{i+1}">{rail(i+1)}<div class="body">{slide_body(s)}</div>'
        f'<div class="foot">{html.escape(s.get("foot", spec["foot"]))}</div></div>'
        for i, s in enumerate(slides))
    doc = f'<!doctype html><meta charset="utf-8"><style>{css(W,H)}</style>{pages}'
    tmp = out / "_render.html"; tmp.write_text(doc)

    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
        pg.goto(tmp.as_uri()); pg.wait_for_timeout(1200)
        for i in range(1, n + 1):
            pg.locator(f"#s{i}").screenshot(
                path=str(out / f"issue-{issue:03d}-slide-{i:02d}.png"))
        og = spec.get("og")
        if og:
            ocss = css(1200, 630) + ".slide{padding:52px 60px 44px}"
            obars = "".join(
                f'<div class="row" style="grid-template-columns:190px 1fr 96px;margin-bottom:9px">'
                f'<div class="city" style="font-size:23px">{html.escape(l)}</div>'
                f'<div class="track" style="height:26px"><div class="fill'
                f'{" dim" if i >= og.get("dim_from", 99) else ""}" '
                f'style="width:{v/og["max"]*100:.1f}%"></div></div>'
                f'<div class="val" style="font-size:22px">{d}</div></div>'
                for i, (l, v, d) in enumerate(og["bars"]))
            odoc = (f'<!doctype html><meta charset="utf-8"><style>{ocss}</style>'
                    f'<div class="slide" id="og"><div class="rail" style="font-size:17px;margin-bottom:26px">'
                    f'<div class="mark"><span class="dot" style="width:19px;height:19px;border-width:2px"></span>MYRO</div>'
                    f'<div>ISSUE {issue:03d} · {html.escape(og.get("series","HIRING HEATMAP"))}</div></div>'
                    f'<div class="body"><h1 style="font-size:41px;line-height:1.14;margin-bottom:26px;max-width:20ch">{og["h1"]}</h1>'
                    f'{obars}</div>'
                    f'<div class="foot" style="font-size:15px;padding-top:22px">{html.escape(og["foot"])}</div></div>')
            otmp = out / "_og.html"; otmp.write_text(odoc)
            opg = br.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=2)
            opg.goto(otmp.as_uri()); opg.wait_for_timeout(1000)
            opg.locator("#og").screenshot(path=str(ROOT / spec["og_out"]))
            otmp.unlink()
        br.close()
    tmp.unlink()
    print(f"issue {issue}: {n} slides -> {out}" + (f"\nog -> {spec['og_out']}" if spec.get("og") else ""))


if __name__ == "__main__":
    main(sys.argv[1])
