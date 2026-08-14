# MYRO — Cockpit
### The one file every agent reads first · v6.0 · August 2026

This file says what is **true today**. It is short on purpose.
History is in [ARCHIVE.md](ARCHIVE.md). Detail is in the files mapped below.
If something here is wrong, fix it in the commit that proves it wrong.

**`AGENTS.md` and `CLAUDE.md` are the same file.** Codex and Claude read this one.
They used to be two, they drifted, and Codex spent months without standing
approval to commit or to apply migrations because of it.

---

## THE GOAL

> Users understand the platform and download their CV as smoothly as possible.
> Then we build the job matching logic through Myro Ops.
> Then we help users tailor a CV for each job.
> — Shivam, 2026-08-05

Three stages, in order. **We are on stage one.** If a task does not make stage
one better, it needs a reason to be worked on now.

---

## SESSION START

1. Read this file.
2. State your plan. Wait for "yes / proceed / go ahead".
3. One task at a time. Commit each when green.
4. **Verify a backlog item in code before building it.** Items get marked "not
   built" and turn out to be shipped. This has cost whole sessions — twice this
   month an agent built, or nearly built, something already live.

---

## ABSOLUTE RULES

- **Never merge to `main`.** Only to `Develop`. `main` is production.
- **Commit finished work to `Develop` — standing approval, no need to ask.**
  When green, `git add` ONLY your own files, commit, push. **Never `git add -A`
  or `.`** — the tree usually holds someone else's uncommitted work. `main`
  needs Shivam.
- **Supabase migrations — apply them yourself, same session.** Then
  `NOTIFY pgrst, 'reload schema';` and spot-check the changed object. Additive
  and reversible only. Anything destructive needs Shivam first.
- **Never hardcode keys.** `.env` only, never committed.
- **Root-cause only.** No try/except, type cast or `|| undefined` to make a
  symptom disappear. If the trade-off is unclear, ask before writing code.
- **Delete on the way past.** If your change makes code unreachable, remove it
  in the same commit — never as a follow-up item. This is how one loading
  screen became three, and how a phase nothing emits stayed in the type for
  months.
- **Design over words.** If the UI already shows a state, don't add text saying
  it. A disabled field does not need "cannot be edited".
- **Newsletter: agree angle + chart + heading with Shivam BEFORE drafting.**

---

## WHAT MYRO IS

Someone uploads a CV. Myro reads it, scores it out of 100 across ten domains,
matches it against live job openings, and shows the exact gap between where they
are and the job they want — then helps them close it.

Web, mobile-responsive. India first.

Coin economy and level thresholds: [DECISIONS.md](DECISIONS.md).

**Stack:** FastAPI · Next.js 14 · Tailwind + shadcn · Supabase/Postgres ·
Railway (backend) · Vercel (frontend) · OpenRouter → Groq → Gemini.

**The one infrastructure fact to hold:** dev and prod share ONE database and ONE
worker. A test upload on dev writes to production data. Full map: [INFRA.md](INFRA.md).

---

## WHERE EVERYTHING LIVES

| Looking for | File |
|---|---|
| Locked decisions + data model | [DECISIONS.md](DECISIONS.md) |
| Servers, domains, env, DNS, deploy order | [INFRA.md](INFRA.md) |
| Open work, in full | [BACKLOG.md](BACKLOG.md) |
| One Myro voice + one memory writer · next session's brief | [MYRO_MENTOR.md](MYRO_MENTOR.md) |
| A read's cost budget · how to diagnose one | [ARCHITECTURE_READ_PATH.md](ARCHITECTURE_READ_PATH.md) · [READ_PATH_PLAYBOOK.md](READ_PATH_PLAYBOOK.md) |
| Closed work, past sessions, history | [ARCHIVE.md](ARCHIVE.md) |
| Domain language and code seams | [CONTEXT.md](CONTEXT.md) |
| Architecture map of the code | `graphify-out/GRAPH_REPORT_frontend.md` |
| Beta feedback closure state | `docs/beta-testing/closure-ledger/` |

⚠️ **Two graphify outputs exist and only one is the code.** The `_frontend`
suffix is the codebase. The unsuffixed `GRAPH_REPORT.md` is a separate docs and
feedback corpus — reading it to understand the code will mislead you.

⚠️ **`/docs` AND `.claude/` are in `.gitignore`** — a NEW file under either is
invisible to every other machine and agent. Put new docs at the repo root.
**Zero skills are tracked:** a skill is a local shortcut, never a place to keep
knowledge. Method goes in the repo; the skill points at it.

---

## WHAT WE ARE WORKING ON

Derived from the goal above. Detail for each: [BACKLOG.md](BACKLOG.md).

### Stage 1 — understand the platform, download the CV (now)

**1. Ship what's fixed to production.** ⚠️ *Shivam only.*
`main` is behind. Right now himyro.com blanks the page after a CV upload, and
large company pages 500. Fixes for both are on `Develop`, tested, waiting. Every
other stage-one item is measured on a site that is currently broken.

**2. Prove the score works end-to-end.** *Closed 2026-08-14 — it runs.*
50 signups in the 14 days to 2026-08-14, and 11 of the 39 who joined after the
fix hold a `mirror_scores` row. The three-day outage (2026-07-31 → 08-03) is
over. Note `cv_upload_jobs.score` is null on every job since `a6425b46`
(2026-07-20) by design — score waits for skill confirmation — so read the score
from `mirror_scores`, never from the job row. The job row's `score`, and the
three places that still read it, are dead and want deleting.

**3. Make upload and download reliable.** *Open — two silent failures closed.*
Upload is the front door. `033c9403` fixed the two that left no trace: a
rejected `/cv/upload/finalize` threw without emitting a phase event (and writes
no job row, so the trail ended at "put succeeded"), and the preflight accepted
the 76-byte cloud-placeholder stub that Drive/OneDrive hand the file picker.
Still left: resume parity between the onboarding and CV routes, real progress,
weak-network testing, and confirmation from the users who hit it.
**Four users have a CV in storage and nothing else** — `8459faec`, `f39204cb`,
`8b27e6e6`, `477051ff` (2026-08-14). They are reachable and worth an email.

**4. Fix the phone.** *Verified open — blocks the app store build.*
Seven screens — CV, Prep, Skills, Coin guide, Intel, Settings, footer — are
still desktop layouts on a phone. The CV screen is one of them, so stage one is
broken on mobile. Also: nobody has opened the rebuilt mobile app on a real phone
while logged in.

**5. Make it fast enough to feel trustworthy.** *#16 software slices closed;
capacity acceptance blocked on paid DB compute.* The 2026-08-13 pass removed
secondary Market reads from J0, collapsed feed context, single-flighted cold
fills, repaired the verifier's cache-evicting claim query, and moved full job
descriptions off feed reads. A warm feed is 477ms backend p95, but a 10-user
Market-arrival burst is 2,161ms p95 on the shared Supabase Free/Nano project.
That project holds 1,118MB against the tier's 500MB recommended DB size and has
224MB `shared_buffers`; do not call launch capacity green until the paid compute
gate in [ARCHITECTURE_READ_PATH.md](ARCHITECTURE_READ_PATH.md) passes.

### Stage 2 — job matching through Myro Ops (next)

Notifications → automatic picks → "show me more". Slices 1 and 2 shipped;
3 to 5 remain. Two related items are blocked on the scraper repo.

### Stage 3 — tailor a CV per job (after)

The tailoring engine is built. This stage is about making it the obvious next
step after a match, not about new machinery.

### Standing, not a stage

- **113 beta feedback items logged as unverified.** Built is not closed. Each
  needs evidence: deployed version, a test, and a user confirming it.
- **The ₹99 Job-Switch Plan is the only revenue item on the board, and it is not
  offered anywhere in the app.** It does not serve stage one. Flagged rather than
  buried — Shivam's call when it earns a slot.

---

## HOW WE WORK

**Python:** 3.11+, async, type hints, Pydantic, Supabase client (no ORM).
**TypeScript:** strict, no `any`, functional components, API calls via
`lib/api.ts`, TanStack Query for server state, Zustand for UI state.
**Commits:** `feat:` `fix:` `chore:` `docs:` `test:` `refactor:` — one scope each.
**No file over 300 lines.** Split it. **375px must work.**
**Claude vs Codex:** Claude takes cross-cutting refactors and multi-file
orchestration; Codex takes mechanical splits, renames and test scaffolding once
the interface is agreed. Both work on `Develop` and run the same five gates.

**Before saying done — all five pass:**

```bash
pytest backend/tests && ruff check <your files>
cd frontend && npx tsc --noEmit && npm run lint && npm test
npm run check:ui-drift && npm run build
```

**Dev:**

```bash
source .venv/bin/activate && PYTHONPATH=backend uvicorn app.main:app --reload
cd frontend && npm run dev
```

---

## SKILLS

`/grill-me` settle an unclear plan · `/read-path-perf` **before touching any
read path** · `/tdd` · `/frontend-design` · `/review` · `/security-review` ·
`/triage-issue` · `/to-issues` · `/to-prd` · `/qa` · `/graphify` · `/schedule` ·
`/improve-codebase-architecture` · `/fixing-accessibility` ·
`/fixing-motion-performance` · `/fixing-metadata` · `/baseline-ui` · `/caveman`

---

## KEEPING THIS FILE TRUE

- **Closed work leaves.** When something ships, delete it here and add one line
  to [ARCHIVE.md](ARCHIVE.md). Do not leave it struck through.
- **No session summaries here.** Git log holds those.
- **Never write "OWED: main merge" or "OWED: deploy dev".** Shivam owns the
  merge; Railway deploys from `Develop` automatically. Those two lines rotted
  about 25 entries into a backlog of work that was already done.
- **If you cannot check a claim in seconds, do not write it.**
- **This file stays under 200 lines.** Past that, something belongs elsewhere.
