---
name: myro-funnel
description: Reverse-engineer Myro's live funnel from code, the running app and production counts, then cut clicks to the first output and design one honest path to a settled Razorpay Apply Pack. Every finding is marked observed, inferred or unknown. Use when growth is slow, when asked to redesign onboarding, the funnel or checkout, count clicks, find where users leak, plan the Fuel or Stakes door, or decide what to ship next for real users.
metadata:
  version: "1"
  method_from: "github.com/NabilRFG12/Reverse-Engineer-anything (evidence discipline only; no REA tools needed)"
---

# Myro funnel: reverse-engineer, cut, ship, measure

Myro's funnel is a shipped product. Treat it the way you would treat someone
else's binary. Do not trust what the docs say it does. Watch what it does, read
what the code says, count who gets through, and only then redesign it.

You are redesigning the funnel. You are not adding a feature.

---

## 0 · Rules for every run

- **Repo `True_Yodha`, branch `Develop`.** Never merge to `main`. Never hardcode a key.
- **The code is what users hit. The latest locked decision is what you design toward.**
  When a doc and the code disagree, name the gap in the ledger. Do not quietly
  reconcile them.
- **This file holds method, not values.** Prices, counts and line numbers live in
  the repo. The seed ledger at the bottom is dated. Re-verify a row before you
  quote it. If this file disagrees with the repo, the repo is right; fix this file.
- **Value, then usage, then price** (`POSITIONING.md`). Pricing UI never jumps a
  bigger leak upstream of it. Settlement correctness is not pricing. When the
  payment slice ships, it goes first (`ARCHITECTURE_PAYMENTS.md` §6).
- **You never make a real charge.** Use Razorpay test mode on dev with test keys
  and the QA account. The one real end-to-end ₹199 charge is Shivam's to make.
- **Never message real users.** A nudge to a cohort is a draft for Shivam to send.
- **Decisions go to Shivam in plain language**: what the user sees, plus one real
  example. Never internal module names.
- **No compute upgrades.** Supabase stays on Pro + Micro. Reads are read-only and
  small. Fix load in code.
- **Every screen goes through `/frontend-design`.** Open `ANTI_SLOP.md` and
  `frontend/app/design-tokens.css` before you draw. Design at 375px first. Prefer
  design to words: a disabled control needs no caption, and a status line is the
  state, not a paragraph about it. It should feel like a career terminal, not a
  SaaS onboarding tour.

---

## 1 · Evidence discipline

Every finding is one row in a ledger. No row, no claim.

| ID | Claim | Kind | Source | Bound |
|---|---|---|---|---|
| E1 | ₹199 checkout hangs if create-order fails | observed-code | `frontend/lib/engagement-checkout.ts:42` @ `<sha>` | 1 of 4 checkout sites |
| E2 | Landing scores a CV with no signup | observed-runtime | dev, 375px, screenshot | anon only |
| E3 | 186 users have a direction | observed-data | `loop_reach.py`, 2026-10-02, own accounts excluded | — |
| E4 | Fuel door has never fired | inferred | from E5 (0 users below 100 coins) | until welcome coins run out |
| E5 | Did any order die after capture? | unknown | needs Razorpay dashboard (Shivam) | — |

**Kinds**

- `observed-code`: you read it at `file:line` on `Develop` at a named commit.
- `observed-runtime`: you clicked it in the browser at 375px and kept the screenshot or accessibility tree.
- `observed-data`: from read-only SQL or `backend/scripts/loop_reach.py`, with a date and own accounts excluded (`services/test_accounts.py`).
- `inferred`: follows from observed rows. Cite them.
- `unknown`: say what would settle it and who holds it.

**Rules**

- Reading code does not show what a user saw. A route existing does not mean users reach it.
- Keep searches bounded. Write "no `.catch` in these 4 files", never "no `.catch` anywhere".
- Do not repeat an identical query. Follow up only on a gap you can name.
- When two docs give different values for one metric, record both with source and date and mark the row `unknown`.
- Static evidence that two things match is a hypothesis, not proof. Click it.

---

## 2 · Route each question to its evidence

| Question | Go to first |
|---|---|
| What does the code do? | `rg` and read on `True_Yodha` `Develop` |
| What does a user see? How many clicks? | Built-in browser on dev with the mobile preset (375px). Prod is look-only: no submits, no payments, no real data. |
| How many real users reach a step? | `backend/scripts/loop_reach.py`, `docs/FEATURE_LOOP_REGISTRY.md`, read-only SQL |
| What is decided? | `DECISIONS.md` (the later row wins), then the spec that row names |
| What does payment actually do? | `backend/app/routers/payments.py`, `ARCHITECTURE_PAYMENTS.md`, `billing_payments` rows (read-only) |
| What may the UI look like? | `frontend/app/design-tokens.css`, `ANTI_SLOP.md` |
| Where does a doc belong? | The "WHERE EVERYTHING LIVES" table in `True_Yodha/CLAUDE.md` |

If a question needs credentials you lack, such as a partner SSO token or the
Razorpay dashboard, mark it `unknown` and name the owner. Never fabricate a
walk you did not take.

---

## 3 · Stage 1: Verify (before any journey map)

Turn the brief into a checklist of questions. Each question names the evidence
it needs. Check these every run, because they drift:

| Claim | Where to check |
|---|---|
| The cockpit loop: upload CV, understand, find a role, download CV | `CLAUDE.md` |
| North star and the live spine counts | `CLAUDE.md` "WHAT WE ARE WORKING ON", then `loop_reach.py` |
| Order of work and the stuck cohorts | `POSITIONING.md` |
| The locked closer (Apply Pack, two doors, one-time) | `DECISIONS.md` ENG2, `ARCHITECTURE_PAYMENTS.md` §1 |
| The live catalogue (what can actually be bought) | `PRODUCTS` in `backend/app/routers/payments.py` |
| Whether the ENG2 modules exist | `billing_catalogue`, `settlement`, `human_check`, `frontend/lib/checkout.ts`, `GET /api/catalogue` |
| Every client checkout | `rg -n 'new Razorpay\(' frontend/app frontend/components frontend/lib` |
| Create-order failure handling at each site | each site's create-order call and its caller's `.catch` |
| What the Fuel door does today | `frontend/components/xp/XPGateModal.tsx` |
| First run: score-first, target not a wall | `frontend/app/onboarding/`, the landing dropzone, `backend/app/routers/public.py` |
| Partner SSO entry | `frontend/app/connect/[partner]/` |
| Prep after apply: one ladder, four steps | `UNIFIED_PREP_V2.md`, `components/preparations/prep-shell.tsx`, `GET /preparations/ladder` |
| Coin costs and the welcome grant | `backend/app/services/xp_policy.py` |
| What stays free forever (Practice, quizzes, certificates) | `DECISIONS.md`, the practice routers |
| Career target as the unit of direction | `PLATFORM_STANDARD_CAREER_TARGET_SKILL_PATH.md` |

---

## 4 · Stage 2: Measure the spine

Run `loop_reach.py`. Write the spine with a count per step, the conversion
between steps, the date, and "own accounts excluded".

- Find the **largest leak nearest the north star** (qualified applications sent).
  That is where the next cut goes.
- When n < 30, report raw counts, not percentages.
- A count that rises between steps (more "matched" than "with a direction")
  means a definition gap. Ledger it as `unknown` before you reason from it.
- Respect the loop order in `CLAUDE.md`: broken steps first, nearest the north
  star first. Pay comes last in that table on purpose.

---

## 5 · Stage 3: Walk the live funnel (click ledger)

Walk each persona at 375px on dev. Write the real sequence:
`URL → click 1 → … → first output → … → Razorpay open() → verify/webhook → visible grant`.

| Persona | Entry | Output they came for | Paid moment |
|---|---|---|---|
| Cold visitor | landing dropzone | Anonymous score | None. Sign up only to see matches or download |
| Partner SSO | `/connect/{partner}` | Same machine, already logged in | Must not become a second product |
| CV, no target | `/onboarding` or home | Target + live jobs | Nothing priced until the machine runs |
| Has target, browsing | `/market` | Save / apply | Stakes door on this job's tailored CV |
| Applied | `/preparations` | Ladder pips + step body | Step 4 costs coins. Apply Pack only if coins run out or they want a human check |
| Empty coins | weave / brief / upload | The blocked action, resumed | Fuel door, same Apply Pack |
| Audit buyer | `/preparations/audit` | Slot, intake, delivered write-up | ₹999 with a bounded queue. Not the closer |

Ledger format:

| Persona | # | URL | Action | Output? | Defect | Evidence |
|---|---|---|---|---|---|---|

Defect codes:

- `SCREEN`: extra screen
- `CONFIRM`: extra confirm
- `HANG`: hung checkout ("Opening checkout…" forever)
- `DETOUR`: "see how coins work" style detour
- `HOP`: a list-then-room navigation that Prep already collapsed
- `WALL`: signup in front of value
- `REFUSE`: a buy button the server will refuse
- `DUP`: duplicate buy button

Total two numbers per persona: **clicks to first output** and **clicks to visible grant**.

---

## 6 · Stage 4: Cut and redesign

**Output is the only spine.** Myro is not a course. An output is a verified,
usable artefact:

1. **Understand**: a score out of 100, ten domains, and skills from this CV.
2. **Find a role**: a target snapshot plus live jobs that match it. A CV with no target is a stuck user.
3. **Apply-ready paper**: a tailored CV for one job, downloadable.
4. **Prep**: the same four steps in every room. What you clear carries.
5. **Paid closer**: Apply Pack, settled, with the grant visible on the same screen.

A click that produces none of these, and does not move the one still missing,
is a deletion candidate. Name every deleted click.

**Targets**

- File chosen, then a score: one click.
- Logged in with a CV: one click to the next missing artefact.
- CV and no target: the next click is picking a target, not a dashboard tour.
- Download ends the loop. It is never a buried export.
- Prep comes after apply. It is never the landing page and never in front of upload.

**Spine to draw** (mark where partner SSO joins and where the no-target cohort is stuck):

```
[land] ── 1 click ──> OUTPUT 1 score
   (partner SSO joins here, already logged in)
        └─ wants the role ──> OUTPUT 2 target + live jobs   <── no-target cohort stuck here
              └─ one job matters ──> OUTPUT 3 tailored CV / download
                    └─ applied ──> OUTPUT 4 Prep ladder (same four steps)
                          └─ pay only when the machine is already running
                               Door A Fuel:   not enough coins for the next weave or brief
                               Door B Stakes: human check before apply, on this job's CV
                               ──> ONE product: Apply Pack
                               ──> ONE client: checkout()
                               ──> Razorpay Checkout.js
                               ──> verify + webhook payment.captured ──> settle() grants once
                               ──> same screen shows coins and/or "Human check · due …"
```

---

## 7 · Stage 5: The closer — two doors, one pack, one checkout

The source of truth is `ARCHITECTURE_PAYMENTS.md` §1 (offer) and §5 (client).
If it changed, it wins over this section.

**Checkout contract in product language.** There is one module and five outcomes:

| Outcome | What the user sees |
|---|---|
| `paid` | The blocked action resumes, or the CV shows the check's state. The output is the thing they were doing, not a receipt page. |
| `setting_up` | "Payment received · setting up your Apply Pack" on the same surface. It resolves by itself. Never a blank home. |
| `dismissed` | Back where they were. No error. |
| `unavailable` | The button never rendered, or they see an honest ETA before paying. Never a buy that returns 409 or 503. |
| `failed` | What happened and what to do, in one line. Distinct from dismissed. |

**Screens to design** (375px, tokens only):

- **Door A · Fuel.** `XPGateModal`: the primary action becomes the Apply Pack, with the price from the catalogue. "See how Myro Coins work" becomes the quiet secondary.
- **Door B · Stakes.** The playground header on a job CV (never the master CV): "Human check before you apply". If they hold an unused check, it reads "Use your human check" and costs nothing.
- **Post-pay states.** `setting_up`; "Human check · due {time}"; "Checked by {name}" plus the note.

**Hard rules**

- A button renders only if `GET /api/catalogue` says the pack is available, with its price, `checks_full` and ETA.
- Create-order is always caught. Dismiss, fail and `payment.failed` stay distinct. An abandoned order is not the same as paid-but-unreconciled.
- The success handler and the webhook both call one `settle`. Duplicate arrivals grant once.
- Coins are closed-loop credit. Prep step 4 is a coin spend. Lacking coins is Door A with the same pack, never a second INR SKU.
- The Audit runs on the same checkout module under a different alias, with a bounded slot taken before the order is created. It never appears on Fuel or Stakes.

---

## 8 · Locked: do not reopen

- Finding the role is inside stage one.
- The career target snapshot is the unit of direction.
- Practice does not change CV-derived matching until the user adds a certificate and saves.
- Prep reads one ladder for rail and room. The job is the occasion. Carry is the pitch. Closed rooms do not claim progress.
- The intake bound is 5 open human artefacts, with a named reviewer on delivery.
- No buy button the server will refuse.
- India first. 375px. Tokens only. The `ANTI_SLOP.md` budget is whatever that file says today; read it.
- The closer is the ENG2 one-time pack. Reopening it as a subscription needs Shivam.

## 9 · Never design these

- A fifth SKU, or the ₹99 pack or the monthly plan revived as a call to action.
- A subscription closer.
- Paywalled Practice, quizzes or certificates. ₹999 never buys access to them.
- Prep as the landing page.
- A roadmap or curriculum explorer (for example a roadmap.sh clone). Myro's edge is ranked, evidenced India-market truth, not a syllabus.
- Myrology on the spine.
- A fifth checkout, an iframe, a scrape of another product, or a "Data Roadmaps" marketing landing.

---

## 10 · Stage 6: Ship and grow

- **Order.** Funnel cuts that touch no money ship as small commits on `Develop`,
  each one passing the `/frontend-design` gates. Payment ships in the
  `ARCHITECTURE_PAYMENTS.md` §6 order: settlement before prettier buttons.
- **Verify a payment change** with Razorpay test mode on dev, from each door:
  exactly one ledger grant, and the right check state. `checkout.test.ts` runs
  the real function against a fake Razorpay: create-order rejects with no hang,
  dismiss returns `dismissed`, and a 202 returns `setting_up`.
- **Look at it.** Render both surfaces and both accents at 375px and screenshot
  before calling visual work done.
- **Measure after shipping.** Re-run `loop_reach.py` after 7 days and compare
  each step against the baseline row in the ledger. Do not claim a lift you
  cannot count.
- **Reach the warm cohorts.** Users who already handed over a CV but have no
  target need no new code to reach. Draft the nudge pointing at the target pick,
  and Shivam decides whether to send it.

---

## 11 · Deliverables

1. **Leak ledger**: the spine counts, with the largest leak nearest the north star named.
2. **Click ledger**: live versus proposed per persona, with every deleted click named.
3. **Spine diagram**: marking partner SSO and the no-target cohort.
4. **Screens**: both doors and every post-pay state, including `setting_up`, at 375px. Copy in Myro's voice: specific and short, no "AI", no three pricing tiers.
5. **Checkout contract** in product language, priced from the catalogue.
6. **Non-screens**: the §9 list, applied to this run.
7. **Honesty flags**: anything built only on paper, anything unused while the welcome coins last, anything unproven until a real charge, and anything that is not the consumer closer.
8. **Checklist closed**: each question from Stage 1 marked answered, partial or unresolved, with the evidence IDs.

Put the write-up wherever `CLAUDE.md` "WHERE EVERYTHING LIVES" says design docs
go. If nothing fits, ask.

## 12 · Finish

Re-read the Stage 1 checklist. Do not call the work done while a required
question is still open. Keep bounded searches bounded in the write-up. Separate
what you observed from what you chose to design.

---

## Appendix · Seed ledger — verified 2026-10-15, `Develop` @ `1913f499`. Re-verify before quoting.

| ID | Claim | Kind | Source |
|---|---|---|---|
| S1 | The live catalogue still has 4 SKUs: `xp_pack` ₹99, `myrology` ₹299, `job_switch_plan` ₹199 (ENG1 subscription), `ai_workflow_audit` ₹999 | observed-code | `backend/app/routers/payments.py:51-66` |
| S2 | ENG2 is not built: no `billing_catalogue`, `settlement` or `frontend/lib/checkout.ts`, and no `/api/catalogue` route | observed-code | bounded `find` and `rg` over `backend/app`, `frontend/lib` |
| S3 | Four Razorpay construct sites | observed-code | `lib/engagement-checkout.ts:46`, `app/myrology/checkout.tsx:157`, `components/settings-modal.tsx:407`, `components/preparations/audit-room.tsx:63` |
| S4 | The ₹199 hang is real: create-order is unguarded, and the caller has `.then` with no `.catch` | observed-code | `lib/engagement-checkout.ts:42`, `app/(authed)/job-switch-plan/page.tsx:77-93` |
| S5 | Myrology, Settings and Audit do catch create-order. The hang is 1 of 4 sites, not all | observed-code | `myrology/checkout.tsx:199`, `settings-modal.tsx:449`, `audit-room.tsx:79` |
| S6 | Fuel door: the primary action links to `/tokens`, which has no buy | observed-code | `components/xp/XPGateModal.tsx:64` |
| S7 | `WELCOME_XP = 3000`, `PREP_BRIEF_XP_COST = 30` | observed-code | `backend/app/services/xp_policy.py:7,54` |
| S8 | The ladder route exists: `GET /preparations/ladder` | observed-code | `backend/app/routers/preparations.py:23,26` |
| S9 | ENG2 (one-time ₹199 Apply Pack) supersedes ENG1 | observed-code | `DECISIONS.md:82` |
| S10 | Spine on 2026-10-02: 947 signed up, 430 uploaded, 420 scored, 186 with a direction, 208 matched, 73 collected, 17 tailored, 3 applied. 14 returning that week | observed-data (as reported) | `CLAUDE.md` "WHAT WE ARE WORKING ON" |
| S11 | Matched (208) exceeds "with a direction" (186), so the step definitions differ | unknown | S10 |
| **GAP-1** | Revenue: `CLAUDE.md:32` says ₹0 real customer revenue; `ARCHITECTURE_PAYMENTS.md:44` says ₹198 from two verified packs | unknown | possibly own or test accounts; confirm with Shivam |
| **GAP-2** | Dead orders: `POSITIONING.md:72` says 22 of 24; `ARCHITECTURE_PAYMENTS.md` §2 lists 23 stuck plus 2 verified | unknown | different dates? |
| **GAP-3** | `POSITIONING.md:125-128,177` still calls the ENG1 subscription the last consumer call to action. ENG2 superseded it | observed-code (stale doc) | `DECISIONS.md:82` |
| S12 | The no-target cohort was 299 on 2026-09-06. Not re-measured | observed-data (stale) | `POSITIONING.md:143` |
| S13 | Partner SSO was about 37% of users | observed-data (as reported) | `POSITIONING.md:48` |
| S14 | Practice, quizzes and certificates are free forever | not verified this pass | — |
