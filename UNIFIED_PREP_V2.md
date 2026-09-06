# Unified Prep v2 — artboard 2b, "One ladder, every room"

Source: Claude Design project `6652e11d-0f4f-4868-95ca-9cf004f30f88`,
file `Unified Prep v2.dc.html`, artboard `#2b`. Pulled 2026-09-06.
Sibling concepts NOT chosen: `2a` "The evidence bank", `2c` "Distance to offer".
**2b is the only one of the three with Finlatics in the left rail.**

Artboard caption, verbatim:

> Four identical steps — evidence, level, rehearsal, brief. Same shape in the
> rail, in the room, on mobile. The platform reads as one machine.

Design ships dark-only hex. Myro implements in `--tm-*` tokens; the accent
`#4fc7f6` IS azure ACC1, `#6ac4eb` is its hover, `#293338` / `rgba(182,223,242,0.10)`
are hairlines, `#a6a69e` / `#8b8b84` are muted / faint ink.

---

## The one idea

Every prep room walks the **same four steps**, in the same order, everywhere:

| # | Step | Existing backend |
|---|------|------------------|
| 1 | Evidence | `GET /cv/jd-coverage` (cached in `job_deepenings`) |
| 2 | Skill level | upskilling readiness / gap start |
| 3 | Rehearsal | same coverage rows, asked back as questions |
| 4 | Day-of brief | `GET /jobs/{id}/prep-brief` (30 coins) |

Clearing a step once counts wherever it applies — that carry is the pitch.

## Desktop frame

`1456px` card, `1px solid #293338`, radius `10px`, bg `#161a1c`.
Topbar import (`Prep Topbar`, 60px), then
`display:grid; grid-template-columns: 360px minmax(0,1fr); min-height:940px`.

### Left rail (`<aside>`)

`border-right: 1px solid rgba(182,223,242,0.10); padding: 20px 18px 36px;
display:flex; flex-direction:column; gap:16px`

**1. Head** — `<h1>Prep</h1>` 17px/600 + `11 live` (Geist Mono 11.5px, faint).
Sub `<p>` 12.5px muted: *"Every room walks the same four steps. Clear a step once
and it counts wherever it applies."*
Then the **ladder legend**: 4 columns, mono 9.5px uppercase label over a
`3px` `99px`-radius bar (`#293338`).

**2. Room list** — `sc-for ladderRooms as r`, each an `<a>`:
`padding:11px 10px; margin:0 -4px; radius 8px; background:{{r.bg}}; border:1px solid {{r.border}}`
(hot room = `rgba(79,199,246,0.10)` on `rgba(79,199,246,0.42)`).
Row: 28px company initials tile · role (13px/600, ellipsis) + `{{r.company}} · {{r.stage}}`
(11px muted) · `{{r.pct}}` (mono 12px/600, azure when ≥2 steps done else muted).
Under it, **4 step pips**: `flex:1; height:4px; radius 99px`, colour per step
state — `2 = azure`, `1 = warn`, `0 = #293338`.
`pct = round(sum(steps) / 8 * 100)`.

**3. Finlatics block — pinned to the bottom of the rail**
`margin-top:auto; padding-top:18px; border-top:1px solid rgba(182,223,242,0.10);
display:flex; flex-direction:column; gap:11px`

- `<header>`: 24px logo (`assets/finlatics.png`) · **Training by Finlatics**
  (13px/600) · `All 11 →` (11.5px/600 link).
- `<p>` 12px muted: *"Step 2 is where your rooms stall. These three cover the
  levels your live rooms keep asking for."*
- `sc-for railTraining as t` → **exactly three** `<article>`:
  `gap:7px; padding:11px 12px; radius 8px; border:1px solid {{t.border}};
  background:{{t.bg}}`, hover `border-color: rgba(79,199,246,0.42)`.
  - row 1: 26px mono mark tile (`#293338` border) + `{{t.title}}` 12.5px/600
  - row 2: 5px dot `{{t.dot}}` + **`{{t.why}}`** 11px `{{t.whyColor}}`
  - row 3: `{{t.meta}}` 11px muted
  - row 4: `{{t.cta}}` — "Apply on Finlatics →" 11.5px/600

  The first card is the matched one: azure border, azure-wash gradient bg,
  azure dot, azure `why`. The other two are faint border on transparent.

**`why` is the whole point of this block.** Design values, verbatim:

| mark | title | why |
|---|---|---|
| PM | Product Management with AI | Covers KPI governance · the L3 ask in 7 of your rooms |
| BA | Business Analyst & Data Science | Covers Analysis L2 · asked by 3M and OpenAI |
| EX | Business Analyst with Excel | Covers reporting · the one level with no drill yet |

`meta` is the existing program blurb, shortened to one line.

### Main column

`padding: 22px 30px 52px`.

**Room head** — 40px company tile · `<h2>` 19px/700 role · `<p>` 13px muted
`"{company} · {stage} · {n} days in stage · CV they have v4"` (v4 is a link) ·
stage chip (pill, azure border, mono uppercase, 6px dot).

**Readiness band** — `gap:26px; padding:18px 22px; radius 10px;
border:1px solid rgba(79,199,246,0.42);
background: linear-gradient(120deg, rgba(79,199,246,0.10) 0%, transparent 62%), #1d2224`
- 76px SVG ring: track `#22282b`, azure stroke, `stroke-width:6`,
  `stroke-dasharray: <pct·195/100> 195`, `rotate(-90 38 38)`, `38%` mono in the middle.
- Kicker `READY FOR THIS INTERVIEW` (mono 10px, 0.12em) ·
  `Step 1 clear — you're on step 2 of 4` 16px/600 ·
  `Same four steps as every other room — <b>what you clear here carries</b>.`
- 4 numbered step pips, `34px` tiles, 78px columns, solid when reached, dashed when not.

**Step cards** — `sc-for stepCards as s`, `gap:10px`, each
`radius 10px; border:1px solid {{s.border}}; background:{{s.bg}}; padding:18px 22px`.
Head: 30px numbered tile · title 16px/600 + sub 12.5px muted · `{{s.state}}` mono ·
CTA pill `height:36px; radius 9999px`.
The **current** step is the only one with the azure border + gradient and the
PRIMARY (filled) CTA; the rest are `#1d2224` on faint border with GHOST CTAs.

Design's four cards, verbatim:

1. **Evidence** — sub `All {reqs} requirements answered · {fromBank} came free from your bank`,
   state `{answered}/{reqs} · clear` (OK green), CTA `Review`.
2. **Skill level** — sub `The levels this job tests, and where you actually are`,
   state `step you're on` (warn), CTA `Start L2`. **Expanded.**
3. **Rehearsal** — sub `Your {answered} answers, asked back as interview questions`,
   state `not started`, CTA `Rehearse`.
4. **Day-of brief** — sub `One page: lead-with stories, likely questions, a plan`,
   state `opens at step 3`, CTA `Get it · 30`.

`showEvidence` / `showLevels` expand one card in place.

**Evidence detail** (step 1 expanded) — rows of `● | requirement | Banked · story | action`,
then `Show the other {n} →` plus the note:
*"Your last answer — change management — was banked as a career story and cleared
step 1 in 4 other rooms too."*

**Level detail** (step 2 expanded) — `levelRows`, each: name 13.5px/600 +
state 11.5px muted, a row of `28px` **rungs** (L1..L5, filled to current,
dashed above), and a CTA:

| name | state | cta |
|---|---|---|
| Key Performance Indicators | You're L1 · this job asks L3 | Start L2 |
| Change Management | No level yet · this job asks L3 | Start L1 |
| Vendor Management | No assessment exists yet | Request path |

Footer of that card, the **only** in-room Finlatics mention:
*"Vendor Management has no drill yet — a Finlatics programme in the rail covers it."*
`See the three matched to you →`

**Cross-room footer** — `padding:14px 18px; radius 8px; faint border`:
*"Across all 11 rooms: **step 1 is 71% clear**, step 2 is 34%, step 3 is 18%,
step 4 is 9%. The bottleneck is step 2."* · `Work step 2 across rooms →`

## Mobile frame (390px)

`radius 22px`, `Prep Mobile Head` import (56px, right slot `38% ready`), then
`padding:16px; gap:16px`:
- 62px ring + `SANOFI · INTERVIEWING` mono kicker / truncated role / `Step 2 of 4`
- the same four `stepCards`, stacked, each with a full-width `44px` CTA button.

Same data, same order, same four steps. That is the "one machine" claim.

---

# What shipped, 2026-09-06

All of 2b, in four commits on `Develop`. Two decisions were Shivam's, taken
before any code: build all of 2b rather than the Finlatics block alone, and
**keep Skill path and the Audit card, below the Finlatics block** — the rail
2b draws holds three items; ours holds five, because `/preparations/audit` has
no other door anywhere in the app.

| Commit | What |
|---|---|
| `ce7055fb` | `GET /preparations/ladder` — the four steps, the totals, the matched three |
| `4506a4e1` | the list and the room become one screen |
| `bcfe5b08` | three tap targets under 24x24 on the rail |
| `16d605aa` | the 390px frame |
| `d9646967` | two claims the room made that its own data did not support |

## The contract

`GET /preparations/ladder` answers the whole surface in one read:

```
rooms[]   job_id · steps[4] (0 not started · 1 started · 2 clear) · pct
          · current_step · levels[] (name, held, required, has_drill)
totals    step_pct[4] · bottleneck_step · rooms
training  program_id · why · matched          (three, always)
training_note
```

Read shape, against the ≤3-concurrent-read contract (ARCHITECTURE_READ_PATH §2):
one lean `job_applications` read, then one wave of three — `job_deepenings`,
`job_skills`, `user_skills`. Four round trips, wave width three. The naive
version is three `get_deepening` calls per room: 33 round trips on an
eleven-room board. `test_prep_ladder_read.py` pins the read set AND the wave
width; those are different regressions.

No step runs a model. Coverage, rehearsal and the brief all live in
`job_deepenings`, so one read answers three steps.

## Deviations from the drawing, and why

- **The rail keeps Skill path and Audit**, under the training block.
- **The room keeps its floor** — the raw JD, Reach, the CV of record and
  notes, below the ladder. 2b draws the ladder; it does not say to delete the
  rest of the room.
- **The step card is a disclosure, not an action.** The design's CTAs
  ("Start L2", "Get it · 30") are the panel's own buttons; a head that both
  expanded and spent coins would be two buttons wearing one label.
- **`Prep Mobile Head`'s right slot** (`38% ready`) is NOT built. It is shared
  chrome across all three artboards, so wiring a per-surface value into
  `MobileTopBar` changes every mobile route and needs its own decision.

## Owed

- **The populated surface has never been seen by a real user session.** The QA
  account holds one saved job and no rooms. The screenshots that verified the
  room were taken by serving a fixture board to the real components in the
  browser — that checks the rendering, not the endpoint. The endpoint is
  covered by its own tests and answers 200 in production.
- **A real phone.** Every mobile measurement is a 375px Chromium.
- `step 3` has no completion signal yet: nothing writes the `prep_rehearsal`
  deepening key, so rehearsal reads 0 for everyone until the panel records it.
