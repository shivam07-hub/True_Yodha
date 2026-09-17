# MYRO — Cockpit
### The one file every agent reads first · v6.0 · August 2026

This file says what is **true today**. It is short on purpose.
History is in [ARCHIVE.md](ARCHIVE.md). Detail is in the files mapped below.
If something here is wrong, fix it in the commit that proves it wrong.

**`AGENTS.md` and `CLAUDE.md` are the same file.** They used to be two, they
drifted, and Codex spent months without standing approval to commit because of it.

---

## THE GOAL

> Upload the CV, find the job closest to your aspiration, tailor a CV for that
> job, download the CV, apply with the new CV on the company portal page for
> that job, prepare for the job till the call comes, repeat.
> — Shivam, 2026-09-13

**Why this is worth owning commercially: [POSITIONING.md](POSITIONING.md).** Every
step produces verified data nobody else holds. Asset-rich, product-poor (mean
asset 6.6, mean product 1.0). Two payments; one partner carries 37% of users.

**It is a loop, and `repeat` is load-bearing.** If a task does not make one of
the seven steps better, or the next pass richer than the last, it needs a reason.

The loop has started to accumulate: upload banks the CV (`a191350a`, 4 real
signups through it) and a CV line is banked as a start, not an answer (#13). 7 of
~884 users have a story; the other 394 CV-holders come forward when they return,
never by a backfill. Matching still reads zero Career Stories (#14); rehearsal
has 0 runs. Reach: [FEATURE_LOOP_REGISTRY.md](docs/FEATURE_LOOP_REGISTRY.md).

---

## THE FORWARD PASS — never backfill

> A user who comes back finds the platform we have now; a user who never comes
> back costs us nothing.

When a capability ships after the data it needs, the people who came earlier are
**brought forward the moment they next arrive**, not migrated while they are
away. Same cost per user, paid only for users who are there; evidence arrives one
user at a time; a bug lands on one person, not everyone at once.

- **A sweep may finish work a user started. It never starts work they did not** —
  the whole line between a heal and a backfill wearing a cron's clothes.
- **Claim first, check cheap, enqueue only.** Never paid for on the read the user
  is waiting on; never run twice; the record it ran is the work's own artefact.
- **Put the door on a path the cohort walks, and state the reach number.** A pass
  on a surface nobody opens is a dead end with a timer.

Every pass is in `backend/app/services/forward_pass.py`; `PASSES` answers "what is a returning user behind on".

---

## SESSION START

1. Read this file.
2. State your plan. Wait for "yes / proceed / go ahead".
3. One task at a time. Commit each when green.
4. **Verify a backlog item in code before building it.** Items get marked "not
   built" and turn out to be shipped. This has cost whole sessions.

---

## ABSOLUTE RULES

- **Never merge to `main`** except a **Notice close** ([CONTEXT.md](CONTEXT.md)):
  branch from `main`, that Notice’s files only, five gates green. Everything
  else lands on `Develop`. `main` is production. `sync-main-to-develop` carries
  a Notice merge; do not invent a second sync.
- **Commit finished work to `Develop` — standing approval, no need to ask.**
  When green, `git add` ONLY your own files, commit, push. **Never `git add -A`
  or `.`** — the tree usually holds someone else's uncommitted work.
- **Supabase migrations — apply them yourself, same session.** Then
  `NOTIFY pgrst, 'reload schema';` and spot-check the changed object. Additive
  and reversible only. Anything destructive needs Shivam first.
- **Never hardcode keys.** `.env` only, never committed.
- **Root-cause only.** No try/except, type cast or `|| undefined` to make a
  symptom disappear. If the trade-off is unclear, ask before writing code.
- **Never backfill.** Existing users are brought forward when they return —
  see THE FORWARD PASS.
- **Delete on the way past.** If your change makes code unreachable, remove it
  in the same commit — never as a follow-up item.
- **No dead ends. A surface nothing links to is not shipped.** If the link is
  someone else's decision the work is BLOCKED, not done: say so, put it in
  [BACKLOG.md](BACKLOG.md) with an owner, and add it to the reach allowlist's
  `debt`. `check:reach` enforces this.
- **Design over words.** If the UI already shows a state, don't add text saying
  it. A disabled field does not need "cannot be edited".
- **Newsletter: agree angle + chart + heading with Shivam BEFORE drafting.**

---

## WHAT MYRO IS

Someone uploads a CV. Myro reads it, scores it out of 100 across ten domains,
matches it against live job openings, and shows the exact gap between where they
are and the job they want — then helps them close it.

Web, mobile-responsive. India first. Coin economy: [DECISIONS.md](DECISIONS.md).

**Stack:** FastAPI · Next.js 14 · Tailwind + shadcn · Supabase/Postgres ·
Railway (backend) · Vercel (frontend) · OpenRouter → Groq → Gemini.

**The one infrastructure fact to hold:** dev and prod share ONE database and ONE
worker. A test upload on dev writes to production data. Full map: [INFRA.md](INFRA.md).

---

## WHERE EVERYTHING LIVES

| Looking for | File |
|---|---|
| **Why we build this commercially — the bet, scored** | [POSITIONING.md](POSITIONING.md) |
| **What we sell · last CTA · LinkedIn Services × Myro** | [OFFERING.md](OFFERING.md) |
| Locked decisions + data model | [DECISIONS.md](DECISIONS.md) |
| Servers, domains, env, DNS, deploy order | [INFRA.md](INFRA.md) |
| Open work, in full | [BACKLOG.md](BACKLOG.md) |
| **Prep = one ladder, four steps** | [UNIFIED_PREP_V2.md](UNIFIED_PREP_V2.md) |
| Vibecoded tells, ruled against our code | [ANTI_SLOP.md](ANTI_SLOP.md) |
| One Myro voice + one memory writer | [MYRO_MENTOR.md](MYRO_MENTOR.md) |
| Read-path budget · latency ledger · funnel | [ARCHITECTURE_READ_PATH.md](ARCHITECTURE_READ_PATH.md) · [READ_PATH_PLAYBOOK.md](READ_PATH_PLAYBOOK.md) |
| Closed work, past sessions, history | [ARCHIVE.md](ARCHIVE.md) |
| Domain language and code seams | [CONTEXT.md](CONTEXT.md) |
| Architecture map of the code | `graphify-out/GRAPH_REPORT_frontend.md` |
| **Every loop + its production reach number** | [FEATURE_LOOP_REGISTRY.md](docs/FEATURE_LOOP_REGISTRY.md) |
| Beta feedback closure state | `docs/beta-testing/closure-ledger/` |

Only `graphify-out/GRAPH_REPORT_frontend.md` is the code. `/docs` and `.claude/`
are gitignored — a NEW file under either is invisible, so put new docs at the
repo root; exception `docs/adr/` (held by `test_adr_numbering.py`). Skills are
local shortcuts, never a place to keep knowledge.

---

## WHAT WE ARE WORKING ON

Detail: [BACKLOG.md](BACKLOG.md). Spine (2026-09-13): **821 signed up → 398
uploaded → 387 scored → 261 matched → 70 collected → 14 tailored.**

| Now | State |
|---|---|
| Ship `Develop` → `main` | Shivam only. Re-verify himyro.com live. |
| Align loops, kill dead ends | Open. Read a loop's number before building on it. |
| Upload + download reliability | Two silent failures closed (`033c9403`). Resume parity, weak-network, four storage-only users left. Score lives in `mirror_scores`. |
| Myro Search pre-flight | Built; never driven authed end-to-end. |
| Phone | Layout swept; `/dev/phone` is the 375 lab; real-device QA owed (#42). |
| Read capacity | Software closed; paid DB compute gate blocks launch (#16). |

After stage one: Job Tracks (gate `4e8fca46`), Myro Ops slices 3–5 (blocked on
the scraper), the Chrome extension, tailoring as the obvious next step. Evidence
bank has no surface — grill first, #45 artboard 2a. Promoting the gap loop out
of prep rooms is BACKLOG #12, unpicked.

Standing: 113 beta items unverified (built ≠ closed); last consumer CTA is ₹199/month Personalised Engagement ([OFFERING.md](OFFERING.md)). Checkout is a Razorpay subscription at 19900 paise; live charges need `RAZORPAY_ENGAGEMENT_PLAN_ID`.

---

## HOW WE WORK

**Python:** 3.11+, async, type hints, Pydantic, Supabase client (no ORM).
**TypeScript:** strict, no `any`, functional components, API via `lib/api.ts`,
TanStack Query, Zustand. **Commits:** `feat:` `fix:` `chore:` `docs:` `test:`
`refactor:` — one scope each. **No file over 300 lines.** **375px must work.**

**Before saying done — all six pass:**

```bash
pytest backend/tests && ruff check <your files>
cd frontend && npx tsc --noEmit && npm run lint && npm test
npm run check:ui-drift && npm run build && npm run check:reach
```

Gates 1–5 prove the code is **correct**; `check:reach` asks whether anyone can
**get to it**. Loop reach: `python backend/scripts/loop_reach.py`.

**Dev:** `PYTHONPATH=backend uvicorn app.main:app --reload` · `npm run dev`.

---

## SKILLS

`/grill-me` · `/read-path-perf` before any read path · `/tdd` ·
`/frontend-design` · `/review` · `/security-review` · `/triage-issue` ·
`/to-issues` · `/to-prd` · `/qa` · `/graphify` · `/schedule` ·
`/improve-codebase-architecture` · `/fixing-accessibility` ·
`/fixing-motion-performance` · `/fixing-metadata` · `/baseline-ui` · `/caveman`

---

## KEEPING THIS FILE TRUE

- **Closed work leaves.** When something ships, delete it here and add one line
  to [ARCHIVE.md](ARCHIVE.md). Do not leave it struck through.
- **No session summaries here.** Git log holds those.
- **Never write "OWED: main merge" or "OWED: deploy dev".** Railway deploys
  `Develop` automatically. Notice closes merge `main` themselves.
- **If you cannot check a claim in seconds, do not write it.**
- **This file stays under 200 lines.** Past that, something belongs elsewhere.
