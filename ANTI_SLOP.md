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

### Tells — present, unbudgeted, fix

| # | Tell | Where | Fix |
|---|---|---|---|
| 24 | Sparkle icons | 7 surfaces (`skills/page`, `skill-room`, `myro-chat`, `card-detail-rail`, `xp-explainer-modal`, `recruiter-dashboard`, `mission-content`) | `Sparkles` is the universal "an AI did this" glyph — and it **contradicts our own copy rule** ("No 'AI' — say what it does"). Replace with the icon of the actual action. |
| 6 | 3 feature cards in a row | `landing-commons.tsx` — three cards, each closing on an `ArrowRight` link | Three parallel cards with identical shape is the template answer. These three things are not peers (source / colleges / newsletter). Give the strip a real structure. |
| 20 | Purple | `--tm-info: #7C3AED` on the light surface; `--gc-purple` + `#8b5cf6` in `/admin/growth` | Purple is **already banned** in the design rules and shipped anyway. Light-surface info tier must leave violet. Admin is internal, so lower priority — but it is still drift. |
| 22 | Radial orbs | `b2b-door-page.css`, `workspace-shell.css`, `myrology.css` — corner glow washes | Corner-glow orbs are pure atmosphere with no information in them. Delete, or make the glow encode something. |
| 9 | Em dashes | 487 in non-comment lines; heaviest in `privacy`, `terms`, `docs-sections`, `settings-modal` | `write-like-human` already bans em-dash spam for **outbound copy**. UI copy never got the rule. Em dash as a *data placeholder* (`"—"` for a null cell) is legitimate notation — exempt. Prose em dashes in UI are the tell. |
| — | Numbered markers that aren't a sequence | `hero.tsx` — "Path 01 · First job" / "Path 02 · Switching" | These are two **mutually exclusive audiences**, not steps. Numbering asserts an order the reader doesn't have. (`mission-content` 01–05 *is* a real sequence — keep.) |
| — | Dead decoration | `.testimonials` + `.experts` grids in `myrology.css` with no consumer | Unreachable CSS from a removed fake-testimonial block. Delete on the way past. |

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

## DETECTION

```bash
cd frontend
grep -rn "Sparkles\|Wand2" app components --include='*.tsx'          # 24 AI-magic glyphs
grep -rniE "purple|violet|indigo|#8b5cf6|#7C3AED" app --include='*.css'  # 20 banned hue
grep -rn "radial-gradient(circle" app components --include='*.css'   # 22 corner orbs
grep -rn "—" app components --include='*.tsx' | grep -vE ":[0-9]+: *(//|\*)" | wc -l  # 9 prose em dashes
grep -rn "repeat(3, 1fr)" app components --include='*.css'           # 6 three-card rows
```

---

## KEEPING THIS FILE TRUE

Counts above are **2026-08-20**. They are evidence, not a scoreboard — when you
fix one, fix the line. When a tell moves LOCKED → TELL because the brand
changed, say so here in the commit that changes it.
