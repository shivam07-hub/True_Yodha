# ANTI-SLOP — the vibecoded tells, and which ones apply to us
### Read before designing any surface · companion to the `/frontend-design` skill

A user can now name AI-built software on sight. Not from bad code — from a
**shared set of defaults** that every model reaches for. When enough of them
stack on one page, the visitor's read is "nobody made this", and everything the
page claims gets discounted. For Myro that is fatal: we ask a stranger to hand
us their CV.

**The tells are not individually wrong.** Lucide is a good icon set. Skeleton
loaders are correct. This file is not a blocklist — it is a **budget**. Each
tell you spend has to be one you chose, for this surface, with a reason. The
slop signal is *density*, not presence.

---

## THE THREE VERDICTS

| | Meaning | What you do |
|---|---|---|
| **LOCKED** | Myro deliberately owns this. It is on the tell list and we keep it. | Never "fix" it. Pay it down elsewhere. |
| **TELL** | Real, unbudgeted, and we should remove or earn it. | Fix, or write the reason next to it. |
| **CLEAR** | We already avoid it. | Don't regress. |

---

## THE 30, RULED

### Locked — on the list, kept on purpose

| # | Tell | Why we keep it |
|---|---|---|
| 2 | Lucide icons | 57 files deep. Swapping icon sets is not a differentiator; **`strokeWidth={1.5}`** and never-decorative usage is. |
| 10 | Inter / Geist / Space Grotesk | We ship **all three of the named faces** (Space Grotesk + Inter + JetBrains Mono). This is our largest single tell. Mitigation is *setting*, not swapping: 5-step scale, no 700+, no italics, mono only on numerals. Revisit the display face when the brand does — not per-component. |
| 19 | Soft corner radius | Ours is **4/6/8/10px** — hard, terminal, not the 16–24px pillow. Already the counter-move. |
| 28 | Hover animations | The Four-Signal Affordance Rule *requires* a hover state. Slop is hover on non-interactive things. Keep, and keep it 200ms + no transform. |
| 29 | Neon | `#00f5d4` is neon. It is the brand. The discipline is the **3-accent budget** — accent on interactive only, status never accent. |

**The rule that follows from this table:** we are already carrying five. That is
the whole budget. Everything below has to come off.

---

### Was drift — closed 2026-08-21

All seven below were closed on **2026-08-21**. They stay on the page as the
record of what the tell looked like here, because the next one will look like
this too.

| # | Tell | What it was | How it closed |
|---|---|---|---|
| 24 | Sparkle icons | `Sparkles` on 7 surfaces — the universal "an AI did this" glyph, contradicting our own copy rule ("No 'AI' — say what it does") | Each swapped for the icon of the **actual action**: `Dumbbell` (Practice ×2), `Coins` (Myro Coins), `Crosshair` (fit ×2), `TrendingUp` (score rises). The seventh meant "Myro is speaking" — that one got [`MyroMark`](frontend/components/myro-mark.tsx). |
| 6 | 3 feature cards in a row | `landing-commons.tsx` — three identical cards, each closing on an `ArrowRight` | Restructured. Two are **doors** (colleges, newsletter); the third is a **checkable claim** (MIT licensed), so it became a fact line on a rule. A verifiable thing doesn't need a box. |
| 20 | Purple | `--tm-info: #7C3AED` on light — banned brand-wide and shipped anyway; plus `#A78BFA` as a hardcoded CSS fallback, and `--gc-purple` in `/admin/growth` | Light info → `#2F4FBF`, the **same 227° hue** as the other two surfaces, 6.5:1 on paper. Dead fallbacks deleted. Admin KPI `tone` typed to a union so a colour with no rule can't ship again. |
| 22 | Radial orbs | Corner glows on `b2b-door-page.css` + `workspace-shell.css` — and they hardcoded **both** accent hexes at once, so the page broke the one-accent rule in either mode | Deleted; flat `--tm-bg`. **Myrology's drift stays** — on a star-chart page the sky *is* the subject, so that wash is content, not borrowed atmosphere. |
| 9 | Em dashes | Claimed 487 | **Overstated — the count was wrong.** 487 included comments and `"—"` null-cell placeholders. Real figure: **375 across 150 files**, ~2.5 each, and the landing has **6**. That is ordinary punctuation, not spam. Two genuine AI tricolons in `mission-content` were rewritten; the rest stand. Term–definition dashes in `docs-sections` are correct typography. |
| — | Numbered markers that aren't a sequence | `hero.tsx` — "Path 01 · First job" / "Path 02 · Switching" | Numbers dropped; the eyebrow now names the reader. Two exclusive audiences are doors, not steps. (`mission-content` 01–05 *is* a real sequence — kept.) |
| — | Dead decoration | `.testimonials`, `.experts` and `.numbers` grids in `myrology.css`, no consumer — residue of a removed fake-testimonial block | 32 lines deleted. `.expert-cred` survived: it is live. |

**What item 9 cost us to learn:** a grep that counts a character counts it in
comments and in data cells too. Measure the thing you are actually claiming, or
you will schedule a 487-edit sweep against a number that was never real.

---

### Clear — hold the line

| # | Tell | Evidence |
|---|---|---|
| 3 | Pure white background | Light surface is `#faf6f0` warm paper. Never `#fff`. |
| 4 | Rainbow coloring | Monochrome + one accent + three status tokens. |
| 12 | Fake testimonials | **Zero** testimonials anywhere in the app. |
| 13 | Bento grids | Zero. |
| 14 | Terminal window chrome | Zero traffic-light window mocks. |
| 15 | "It's not X, it's Y" | Zero. (`not just` appears 5× as ordinary comparison, not the construction.) |
| 17 | Three pricing tiers | No pricing grid ships. One plan, and it isn't surfaced. |
| 18 | No real product demos | The landing runs the **real dropzone** and live corpus counters. |
| 21 | No skeleton loaders | 90 files carry skeletons; light surface has its own skeleton token. |
| 25 | Animated arrows | Arrows are static — no `hover:translate-x` anywhere. |
| 26 | No TOS | `/terms`, 261 lines. |
| 27 | No privacy policy | `/privacy` 242 lines, `/security` 167. |
| 30 | Basic pastel colors | Status washes are `oklch` on paper, not pastel fills. |

Item 5 (drop shadows), 8 (liquid glass), 11 (left stripe), 16 (checkmark
bullets), 23 (dot grids) are **present but token-bound** — two shadow tiers,
`backdrop-blur` on 10 files (nav, modals, sheets — where a glass layer means
"floating above"), border-left as a status stripe on cards. Held, not clear.
They tip into TELL the moment one is used for decoration rather than state.

---

## THE PRE-CODE GATE

Before writing a component, answer these. Any "yes" needs a written reason in
the same file.

- [ ] Am I adding a **sixth** tell to the five we already own?
- [ ] Is this icon `Sparkles`, `Wand2`, or `Zap` — i.e. am I saying "AI" with a glyph?
- [ ] Are these three cards in a row *actually* three peers, or did I land on three because three fits?
- [ ] Do these numbered markers describe a real order the reader needs?
- [ ] Is this gradient/glow/blur carrying information, or is it atmosphere?
- [ ] Is this em dash prose, or is it a null-value placeholder?
- [ ] Is the hover state on something that is actually clickable?
- [ ] Would this page still be recognisable as *ours* with the accent turned grey?

That last one is the real test. If the answer is no, the accent was doing the
work that structure and type should have been doing.

---

## ENFORCEMENT

Three of these are no longer on the honour system. `ui-drift-guard.mjs` ratchets
them at **zero**, so they fail the build the moment one comes back:

```bash
cd frontend && npm run check:ui-drift
```

| Metric | Catches | Deliberately does not catch |
|---|---|---|
| `sparkleGlyph` | `<Sparkles`, `icon: Sparkles`, `Wand2` | the word in prose — `myro-mark.tsx` documents why the glyph is banned, and a guard that flags its own rationale gets deleted |
| `bannedPurpleHue` | a banned purple hex **in a declaration** | `--my-*` lines (amethyst *is* the Myrology sub-brand) and hexes inside comments |
| `cornerOrbWash` | `radial-gradient(circle at top\|bottom` | Myrology's `radial-gradient(circle, …)` drifting field — there the sky is the subject |

Both carve-outs live in the pattern, not in a file-path exclude, so they survive
a rename. All three were tested by injecting each violation and confirming the
gate fails — **a zero you have not tried to break is not a guard.**

Em dashes are deliberately *not* ratcheted. A raw character count includes
comments and `"—"` null-value cells, which is how the first pass got 487 for
what is actually 375 (item 9). Measure it with a parser when you want the
number:

```bash
cd frontend && python3 -c '
import os,re
strip=lambda s:re.sub(r"^\s*//.*$","",re.sub(r"/\*.*?\*/","",s,flags=re.S),flags=re.M)
tot=0
for root,_,fs in os.walk("."):
    if any(x in root for x in ("node_modules",".next",".git")): continue
    if not (root.startswith("./app") or root.startswith("./components")): continue
    for f in fs:
        if f.endswith((".tsx",".ts")):
            s=strip(open(os.path.join(root,f),encoding="utf8").read())
            tot+=re.sub(r"[\"\x27\x60]\s*—\s*[\"\x27\x60]","",s).count("—")
print("prose em dashes:",tot)'
```

### One thing the guards cannot do

A contract test that names a *mechanism* instead of a *rule* will fail the
correct change. `deep-field-canvas-contract` asserted `.tm-b2b-page` contained
a `radial-gradient` — but its three sibling assertions all check the real
contract, "this island paints its own opaque background". Deleting the orbs
kept the contract and broke the assertion. Fix the assertion, not the change —
and be sure that is what happened before you touch a test.


---

## KEEPING THIS FILE TRUE

Counts above are **2026-08-20**. They are evidence, not a scoreboard — when you
fix one, fix the line. When a tell moves LOCKED → TELL because the brand
changed, say so here in the commit that changes it.
