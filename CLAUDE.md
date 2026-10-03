# MYRO — Cockpit
### The one file every agent reads first · v7.0 · October 2026

This file says what is **true today**. It is short on purpose.
History is in [ARCHIVE.md](ARCHIVE.md). Detail is in the files mapped below.
If something here is wrong, fix it in the commit that proves it wrong.

`AGENTS.md` is a pointer to this file — one cockpit, never two copies.

---

## THE GOAL

> Upload the CV, find the job closest to your aspiration, tailor a CV for that
> job, download the CV, apply with the new CV on the company portal page for
> that job, prepare for the job till the call comes, repeat.
> — Shivam, 2026-09-13

> Myro is a CV-building machine for applying to the jobs you want. How fast and
> how easily they can do it is the entire game. — Shivam, 2026-09-30

**North star: qualified applications sent** (the judge rated the job ≥3.5).
Today: **3 people, 5 applications, ever.** Myro's own accounts are flagged
`is_test_account` and excluded from every count (`services/test_accounts.py`).

**The cut rule.** An item stays open only if it fixes a broken or leaking step of
the loop, or brings a user back for the next pass. Everything else is parked in
ARCHIVE with one line saying why. **Myrology is exempt** — a second product line,
judged on its own revenue (Shivam, 2026-09-30).

**Why this is worth owning commercially: [POSITIONING.md](POSITIONING.md).**
Real customer revenue to date: ₹0. Reach per loop: [FEATURE_LOOP_REGISTRY.md](docs/FEATURE_LOOP_REGISTRY.md).

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
  else lands on `Develop`. `main` is production; Shivam merges it — daily when
  `Develop` is green, at once for a core-loop fix. A core-loop item is closed when
  it is on `main` and one real user has hit it.
- **Commit finished work to `Develop` — standing approval, no need to ask.**
  When green, `git add` ONLY your own files, commit, push. **Never `git add -A`
  or `.`** — the tree usually holds someone else's uncommitted work.
- **Supabase migrations — apply them yourself, BEFORE pushing the code that
  reads them.** Then `NOTIFY pgrst, 'reload schema';` and spot-check. Additive,
  reversible; destructive needs Shivam. `/health/ready` names a missing column.
- **Never hardcode keys.** `.env` only, never committed.
- **Root-cause only.** No try/except, type cast or `|| undefined` to make a
  symptom disappear. If the trade-off is unclear, ask before writing code.
- **Never backfill.** Existing users are brought forward when they return.
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

A person uploads a CV, picks the job they want — pasted, saved with the Chrome
extension, or from Myro's judged list — gets a CV tailored to it, downloads it,
applies on the company's own page, prepares, and comes back. The Myro Score and
the gap read are what the machine knows about you, not the product.

Web, mobile-responsive. India first. Coins + the ₹199 Apply Pack: [DECISIONS.md](DECISIONS.md) ENG2.

**Stack:** FastAPI · Next.js 14 · Tailwind + shadcn · Supabase/Postgres ·
Railway (backend) · Vercel (frontend) · OpenRouter → Groq → Gemini.

**The one infrastructure fact to hold:** dev and prod share ONE database and ONE
worker. A test upload on dev writes to production data. Full map: [INFRA.md](INFRA.md).
Jobs come from the scraper repo (Shivam's); this repo only reads them.

---

## WHERE EVERYTHING LIVES

| Looking for | File |
|---|---|
| **Why we build this commercially — the bet, scored** | [POSITIONING.md](POSITIONING.md) |
| **What we sell — superseded by ENG2, rewritten in #56 S5** | [OFFERING.md](OFFERING.md) |
| Locked decisions + data model | [DECISIONS.md](DECISIONS.md) |
| Servers, domains, env, DNS, deploy order | [INFRA.md](INFRA.md) |
| Open work, in loop order | [BACKLOG.md](BACKLOG.md) |
| **Specs Cursor builds from** | `ARCHITECTURE_*.md` at the root — RETURN_LOOP #55 · PAYMENTS #56 · FRONT_DOOR #57 · CV_TIER_A #58 · GOLDEN_DIGEST #59 · LISTING_TIME · CONTRACTS_BY_TYPE |
| **Prep = one ladder, four steps** | [UNIFIED_PREP_V2.md](UNIFIED_PREP_V2.md) |
| Vibecoded tells, ruled against our code | [ANTI_SLOP.md](ANTI_SLOP.md) |
| One Myro voice + one memory writer | [MYRO_MENTOR.md](MYRO_MENTOR.md) |
| Read-path budget · latency ledger · funnel | [ARCHITECTURE_READ_PATH.md](ARCHITECTURE_READ_PATH.md) · [READ_PATH_PLAYBOOK.md](READ_PATH_PLAYBOOK.md) |
| Closed work, parked ideas, history | [ARCHIVE.md](ARCHIVE.md) |
| Domain language and code seams | [CONTEXT.md](CONTEXT.md) |
| Architecture map of the code (AST, 2026-06-14 — rebuild before trusting) | `graphify-out/GRAPH_REPORT_frontend.md` |
| **Every loop + its production reach number** | [FEATURE_LOOP_REGISTRY.md](docs/FEATURE_LOOP_REGISTRY.md) |

`/docs` and `.claude/` are gitignored — a NEW file under either is invisible, so
put new docs at the repo root; exception `docs/adr/` (held by
`test_adr_numbering.py`). Skills are local shortcuts, never a place to keep knowledge.

---

## WHAT WE ARE WORKING ON

Detail and owners: [BACKLOG.md](BACKLOG.md). Spine (2026-10-02, own accounts
excluded): **947 signed up → 430 uploaded → 420 scored → 186 with a direction →
208 matched → 73 collected → 17 tailored → 3 applied.** Returning this week:
**14** (`last_active_at`, true since 2026-10-03). Run `backend/scripts/loop_reach.py`.

Order is the loop map — broken steps first, nearest the north star first (Shivam, 2026-09-30):

| # | Step | Now |
|---|---|---|
| 1 | Find the job | Corpus live again (ingestion 2026-10-01). #55 Return Loop: a returning user's list must never vanish. |
| 2 | Apply | No Apply click since 2026-09-22. Ship what is built, then measure click → "Did you submit?" → application. |
| 3 | Repeat | #55 rest + the golden-list digest: `user_profiles.golden_list_since`, email only to them. |
| 4 | Front door | After upload: "Which job do you want?" — paste a job · the extension · jobs that fit. Target: tailored CV downloaded in <10 min, ≤5 clicks. |
| 5 | Tailor + download | CV Tier A: #49 page-fill gate, #52 empty certs, #50 add role on desktop, #47 keep unknown sections, no invented roles. |
| 6 | Pay | #56 Apply Pack — [ARCHITECTURE_PAYMENTS.md](ARCHITECTURE_PAYMENTS.md), Cursor. |

Gates on everything: #16 paid DB compute (Supabase Pro + Small, Shivam) · prod
deploy guard (`PORT=8000`, then `healthcheckPath`, Shivam). How far `Develop` is
ahead: `git rev-list --count origin/main..origin/Develop`.

---

## HOW WE WORK

**Python:** 3.11+, async, type hints, Pydantic, Supabase client (no ORM).
**TypeScript:** strict, no `any`, functional components, API via `lib/api.ts`,
TanStack Query, Zustand. **Commits:** `feat:` `fix:` `chore:` `docs:` `test:`
`refactor:` — one scope each. **375px must work.**

**Before saying done — all six pass:**

```bash
pytest backend/tests && ruff check <your files>
cd frontend && npx tsc --noEmit && npm run lint && npm test
npm run check:ui-drift && npm run build && npm run check:reach
```

Gates 1–5 prove the code is **correct**; `check:reach` that anyone can **get to
it**; `match_quality.py` that they were the RIGHT jobs. Reach: `loop_reach.py`.

**Dev:** `PYTHONPATH=backend uvicorn app.main:app --reload` · `npm run dev`.

**Skills:** `/grill-me` · `/read-path-perf` before any read path · `/tdd` ·
`/frontend-design` · `/review` · `/security-review` · `/improve-codebase-architecture`
· `/qa` · `/graphify` · `/fixing-accessibility` · `/baseline-ui` · `/caveman`

---

## KEEPING THIS FILE TRUE

- **Closed work leaves.** When something ships, delete it here and add one line
  to [ARCHIVE.md](ARCHIVE.md). Do not leave it struck through.
- **No session summaries here.** Git log holds those.
- **Never write "OWED: main merge" or "OWED: deploy dev".** Railway deploys
  `Develop` automatically. Notice closes merge `main` themselves.
- **If you cannot check a claim in seconds, do not write it.**
- **This file stays under 200 lines.** Past that, something belongs elsewhere.
