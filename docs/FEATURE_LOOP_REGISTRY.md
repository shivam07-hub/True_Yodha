# Myro — Feature & Loop Registry
### Source of truth for "is this loop actually closed" · v2.0 · 2026-09-13

Regenerated from the code and from **production counts**, not from a graph run.
v1.0 (2026-05-27) was generated from graphify + a CLAUDE.md audit and drifted
until it described a product we no longer run: it said "Forge" 33 times, a
feature since renamed to Practice, and had **zero** mentions of the reservoir,
coverage, `career_stories` or weave — the machinery the product now turns on.

**The rule this file exists to enforce:**

> A loop is not closed because the code is correct. It is closed when a number
> from production says a real user went round it.

Every loop below carries that number. Tests, types, lint, ui-drift and build —
all five gates — prove the code works. **None of them can tell you whether
anyone can reach it.** That is the gap every dead surface in this file fell
through.

**Counts are from prod, 2026-09-13.** Re-measure before trusting them; the
queries are in [§ How to regenerate](#how-to-regenerate).

---

## THE SPINE — the four-step goal, with the drop at each step

> Upload the CV, understand the platform, find a role for you, then download
> the CV. — Shivam, 2026-08-28

```
signed up                                  818
  ↓ 49%
uploaded a CV                              397
  ↓ 97%
got a Myro Score                           386      ← "understand" works
  ↓ 67%
has job matches                            260      ← "find a role" works
  ↓ 27%
collected a role                            69      ← the cliff
  ↓ 20%
tailored a CV version                       14      ← "download" barely happens
```

**The spine holds for three steps and falls off at the fourth.** 386 of 397
CV-uploaders get a score; 260 get matches. Then 69 collect anything and 14 ever
produce a tailored CV. The goal's last word — *download* — is reached by 1.7% of
signups and 3.5% of CV-holders.

Everything below is a loop hanging off this spine. Read the spine first: a loop
that starts after step 4 can only ever serve 14 people.

---

## LOOP LEDGER

| # | Loop | Reach | Verdict |
|---|---|---|---|
| L1 | Upload → Score → Match → re-upload | 313 re-scored | **CLOSED** |
| L2 | Skills confirm → target → matches | 389 / 99 | **CLOSED** |
| L3 | Collect → prep room → 4 rungs → apply | 69 → 28 | **LEAKING** |
| L4 | JD gap → answer → career story → tailored CV | **2** | **NEVER FIRED** |
| L5 | Gap → Practice → certificate → CV line | 21 passed → **2** on a CV | **LEAKING BADLY** |
| L6 | Save job → intel → follow company → heatmap | 46 | **LEAKING** |
| L7 | Notification → return → act | 378 sent, return unmeasured | **UNINSTRUMENTED** |
| L8 | Partner SSO → seat → activation | 330 | **CLOSED (not ours)** |
| L9 | Referral → new user | **0** | **DEAD** |
| L10 | Newsletter → signup | unattributed | **UNINSTRUMENTED** |
| L11 | Coin economy → spend → unlock | 818 ledgered, 2 paid | **NOT A LOOP YET** |

---

### L1 — Upload → Score → Match → re-upload · **CLOSED**

```
POST /cv/upload → cv_workflow → cv_versions + mirror_scores
  → job_matcher → user_job_matches → /market cards
  → user edits/re-uploads → new version → re-score  ↺
```

**313 of 386 scored users have more than one score.** 43 have more than one CV
version. This is the one loop that demonstrably goes round more than once at
scale, and it is the product's actual engine today.

⚠️ Score lives in `mirror_scores` and waits for skill confirmation
(`a6425b46`); a finished upload job carries no score by design.

---

### L2 — Skills confirm → career target → matches · **CLOSED**

```
onboarding → user_skills (389 users) → career_target_snapshots (99)
  → role-family targeting → user_job_matches
```

389 of 397 CV-holders confirm skills — the highest-completion step in the
product. 99 hold a career target. Matching reads both.

---

### L3 — Collect → prep room → four rungs → apply · **LEAKING**

```
/market → collect (job_applications, 69 users)
  → /preparations/[jobId] — four rungs:
       1 CoveragePanel   (what this job wants vs what you've banked)  ← L4 lives here
       2 LevelRows + DrillPanel  (skill levels)                       ← L5 lives here
       3 RehearsePanel   (rehearsal marks the STORY, not the job)
       4 BriefCard       (per job, correctly)
  → stage: saved → applied → interviewing → ghosted/rejected
```

69 users collected something; **28 rooms ever moved past `saved`**; 25 users
collected more than one role. All five stages are in use, so the ladder works —
but 60% of rooms never advance, and the room is where L4 and L5 both live.

**This is the bottleneck that starves two other loops.** Fixing L4's reach is
mostly a question of not requiring a prep room first.

---

### L4 — JD gap → answer → career story → tailored CV · **NEVER FIRED**

```
POST /cv/jd-coverage        LLM-parses the JD's REAL requirements
  → matched against (a) career_stories via memory_recall
                    (b) the CV's own bullets (jd_coverage.bullets_from_cv)
  → covered / weak / gap
  → Myro asks ONE question about a gap
  → POST /cv/jd-coverage/answer  |  POST /cv/weave/answer
  → framed + ingested → career_stories (STAR + metrics + skills + a CV bullet)
  → banked against the PERSON — counts in every other room
  → career_projection → the tailored CV download                      ↺
```

**2 users have ever answered a gap. 3 users have a career story.**

This is the most valuable loop in the product and the least reached. Two
properties, neither obvious:

- **It needs no dump.** Coverage falls back to the CV's own bullets, so it works
  on an empty reservoir. `e91eef0b` built an entire reservoir from zero on
  2026-08-05 with three weave answers and no dump at all.
- **It is the only inflow that produces something the user did not already
  have.** Every other path re-reads what they already wrote; this one extracts
  what was never on the CV — the thing they actually get rejected for.

**Why it is starved:** `CoveragePanel` is rung 1 *inside a prep room*. A user
must upload a CV, find a job, collect it, open the room, and land on the right
rung before Myro ever asks a question it could bank. 328 of 397 CV-holders never
get that far (see L3).

**It was also leaking silently until 2026-09-12.** Gap answers were written
`kind='note'` while the inflow ledger read `kind IN ('file','linkedin')`, so a
failed answer was invisible to `ingest_status` and unreachable by
`retry_stale_ingests`. Three sat pending for two months. Fixed in `262b7250`:
`kind='answer'` + CHECK + `INFLOW_KINDS`, plus `reservoir_ingest_sweep` (hourly,
all users, bulk lane) so the heal no longer depends on opening the Stories tab.

**Open decision — BACKLOG TIER 3 #12:** `/cv/upload` never touches the reservoir
at all. Either upload enqueues its own ingest (a paid extraction per signup), or
the gap loop stays the only way in and gets moved to where users already are.

---

### L5 — Gap → Practice → certificate → CV line · **LEAKING BADLY**

```
skill gap → /practice → quiz_attempts (65 users, 101 passes, 21 passers)
  → skill certificate issued
  → certificate_to_cv handler → cv_structured.certs → a checkable CV line   ↺
```

**101 passes, 21 users who passed, and 2 users with a Myro certificate line on
their CV.** 230 users have certs on their CV, but those were parsed from the
document they uploaded — zero carry a Myro `verification_id`.

The last hop is built and works (the handler writes `cv_structured["certs"]`,
the line carries a verify URL a recruiter can open). It has fired for 2 of 21
eligible people. **Find out why before building anything new on this loop** —
the difference between "the handler never runs" and "users pass but never earn a
cert" is the whole diagnosis, and it is not in this file yet.

Only 7 users ever ran a forge/practice session, against 65 who took a quiz.

---

### L6 — Save job → intel → follow company → heatmap · **LEAKING**

```
/market → job detail → company page → follow (followed_companies, 46 users)
  → /intel, /hiring, sector panels → new roles surface  ↺
```

46 users follow a company. The read side (intel, ghost index, sector panels,
company pulse) is heavily built — 95,723 jobs, 600,056 listing observations,
26,996 company skill profiles — against 46 people who asked to be told.

**Asset-rich, product-poor, exactly as POSITIONING.md says.** The data is the
strongest thing Myro owns and the smallest number of users touch it.

---

### L7 — Notification → return → act · **UNINSTRUMENTED**

378 users have received a notification (`user_notifications`, 396 rows). Whether
any of them came back and did the thing is **not measured anywhere**. Myro Ops
slices 3–5 (automatic picks, "show me more") are blocked on the scraper.

A loop you cannot measure is a loop you cannot claim. Add the return event
before building more of it.

---

### L8 — Partner SSO → seat → activation · **CLOSED (not ours)**

330 of 818 users — **40%** — arrive through one partner integration (Finlatics
SSO + webhooks). This is the largest single inflow into the product and Myro
does not own it. `partner_usage_events` (190) meters active seats by IST month.

⚠️ Concentration risk stated plainly: if that partner leaves, 40% of the user
base leaves with it.

---

### L9 — Referral → new user · **DEAD**

```
/referral  → (no inbound link anywhere in the codebase)
user_profiles.referred_by_user_id → 0 rows
```

**Zero referrers. Zero arrivals. Zero links into the page.** The route exists,
the column exists, nothing connects them. Either wire it or delete it — an
untouched loop with a live route is indistinguishable from a broken one.

---

### L10 — Newsletter → signup · **UNINSTRUMENTED**

`/newsletter` + `/newsletter/[slug]` are the acquisition surface and carry real
SEO/AEO work. Nothing attributes a signup to an issue. `growth_messages` (55)
and `growth_attribution` exist; neither is wired to the newsletter.

---

### L11 — Coin economy → spend → unlock · **NOT A LOOP YET**

All 818 users have a `coin_ledger` row (1,334 rows). **2 verified payments
ever.** The ₹99 Job-Switch Plan and the ₹999 AI Workflow Audit are both built
and neither is purchasable anywhere in the app.

Coins are currently an accounting record, not a loop: nothing the user does with
them changes what happens next in a way that brings them back.

---

## ORPHAN SURFACES — the notebook class

A page that exists, renders, passes every gate, and has **no way in**. The
pattern that produced them: work shipped with an explicit handoff to a decision
("nav placement is a Shivam product call") that never came, and nothing surfaced
the omission again.

Specimen: `/notebook` shipped 2026-07-06 with exactly that sentence in its own
commit message, sat unreachable for 68 days, took **zero rows**, and was deleted
2026-09-12 (`262b7250`).

57 routes. These have **zero** references anywhere — frontend, backend, emails,
sitemap:

| Route | Reading |
|---|---|
| `/referral` | **orphan + dead loop (L9).** Wire it or delete it. |
| `/beta-feedback` | **orphan.** 114 ledger items and no way to file the 115th. |
| `/(authed)/recruiter` | **orphan.** Distinct from the public `/recruiters` door, which IS in `site-routes.ts` + footer + sitemap. |
| `/welcome` | **orphan.** Nothing redirects here post-signup. |
| `/signup/institutions` | expected — B2B campaign landing, entered externally. |
| `/admin/growth` | expected — admin. |
| `/offline` | expected — PWA fallback served by the service worker. |

Reachable only by URL or redirect — verify before assuming a user gets there:
`/cv/export`, `/dashboard`, `/mission`, `/myro`, `/xp`, `/preparations/audit`,
`/extension/connect`, `/dev/phone` (1 ref each); `/home` is a retired redirect
stub.

**The authed primary nav is four destinations:** Jobs (`/market`), Collections
(`/collections`), CV (`/cv?view=cv`), Prep (`/preparations`) — plus Myrology,
Intel and Newsletter behind unlock predicates (`frontend/lib/nav-items.ts`).
`nav-items.ts` still declares ids `forge` and `tracker` that no item defines.

---

## WHAT TO DO WITH THIS FILE

1. **Before building on a loop, read its number.** Building slice 4 of a loop
   that 2 people have reached is not a slice, it's a bet.
2. **A new surface is not shipped until something links to it.** If the link is
   someone else's decision, the work is not done — it is blocked, and it belongs
   in BACKLOG with an owner, not in a commit message.
3. **When a loop's number does not move after a release, the release did not
   work** — regardless of what the tests said.

---

## HOW TO REGENERATE

The numbers, in one query (Supabase SQL editor or the `supabase` MCP):

```sql
select 'signed up' step, count(*)::text n from user_profiles
union all select 'uploaded a CV',        count(distinct user_id)::text from cv_versions
union all select 'got a Myro Score',     count(distinct user_id)::text from mirror_scores
union all select 'has job matches',      count(distinct user_id)::text from user_job_matches
union all select 'collected a role',     count(distinct user_id)::text from job_applications
union all select 'answered a JD gap',    count(distinct user_id)::text from cv_dump_entries where source='jd_gap_answer'
union all select 'has a career story',   count(distinct user_id)::text from career_stories
union all select 'tailored a CV',        count(distinct user_id)::text from cv_versions where job_id is not null
union all select 'passed a quiz',        count(distinct user_id)::text from quiz_attempts where passed
union all select 'followed a company',   count(distinct user_id)::text from followed_companies
union all select 'partner SSO',          count(distinct user_id)::text from partner_users
union all select 'arrived via referral', count(*)::text from user_profiles where referred_by_user_id is not null;
```

Orphan-route scan (from `frontend/`):

```bash
python3 - <<'PY'
import re, pathlib
SRC=[f for r in ("app","components","lib") for f in pathlib.Path(r).rglob("*") if f.suffix in (".ts",".tsx")]
def route_of(p):  # strip Next.js (group) segments
    return "/" + "/".join(s for s in p.parent.parts[1:] if not (s.startswith("(") and s.endswith(")")))
routes = sorted({route_of(p) for p in pathlib.Path("app").rglob("page.tsx")})
print(f"{len(routes)} routes; orphans (<2 refs, excluding the route's own files):\n")
for rt in routes:
    if "[" in rt: continue                      # dynamic segments are linked by builder
    pat = re.compile(r'["\'`]' + re.escape(rt) + r'(?:["\'`/?])')
    own = "app" + rt + "/"
    hits = {str(f) for f in SRC if not str(f).startswith(own) and pat.search(f.read_text(errors="ignore"))}
    if len(hits) < 2: print(f"  {rt:<26} {len(hits)} ref(s)")
PY
```

A 0-ref result is not automatically a bug — campaign landings, admin and the PWA
fallback are entered from outside. It IS a bug whenever the route was meant to be
reached from inside the product. Check the backend, emails and the sitemap before
ruling:

```bash
grep -rn "/your-route" backend/app frontend/public frontend/lib/site-routes.ts
```

The code map (architecture, not loops) is `graphify-out/GRAPH_REPORT_frontend.md`
— the `_frontend` suffix is the codebase; the unsuffixed `GRAPH_REPORT.md` is a
docs/feedback corpus and will mislead you about the code.

---

## CHANGED FROM v1.0 (2026-05-27)

- **Retired:** Loops A–F as written. "Daily Forge → Skill Progression" is now
  L5 under the Practice name; "Win → CV → Score → Jobs" is L1; "Record a Win"
  was never built and the diary it replaced is retired.
- **New and absent from v1.0 entirely:** L4 (the reservoir / gap loop), L2
  (skills → target → matches), L8 (partner SSO — now 40% of all users), L11.
- **The investor framing** (7-node "Upload → Score → Match → Tailor → Apply →
  Upskill → repeat") is kept in spirit by THE SPINE above, now with the drop
  measured at each step rather than asserted.
- **Every loop now carries a production number.** v1.0 carried none, which is
  why it could drift for four months without anyone noticing.
