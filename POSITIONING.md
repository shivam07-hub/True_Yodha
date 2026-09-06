# MYRO — Positioning
### Why this platform exists commercially · benchmarked 2026-09-04, verified in code and prod

> This file exists because the strategy lived in a chat artifact and a
> gitignored memory folder, which means Codex, a fresh clone and the next
> session could not read it. A direction nobody can read is not a direction.
> Cockpit: [CLAUDE.md](CLAUDE.md).

---

## THE BET

**Become the human layer that AI depends on in one domain: truth about the
Indian job market.**

Intelligence is cheap now. Anyone can generate a CV, a job description, a
listing. What is scarce is knowing which of it is *true* — whether a role is
real, whether a skill claim is evidenced, whether an ad still leads anywhere.
Myro already runs the machinery that answers those questions. The commercial
work is putting a price on the doing.

This does not replace the product goal in [CLAUDE.md](CLAUDE.md) — upload the CV,
understand the platform, find a role, download the CV. It is why that loop is
worth owning: every step of it produces verified data nobody else holds.

---

## THE FINDING

Benchmarked against the bet, scored twice: **asset** is what exists and would be
expensive to rebuild; **product** is whether a stranger can buy it.

| Bet | Asset in place | Asset | Product |
|---|---|---|---|
| Verify what is true | 462k evidence-stamped observations, verifier, certificates, voice rules | 8.5 | 1.0 |
| Own the niche data | 72.5k jobs from 60+ employer ATS adapters, 555k skill edges, 295 companies | 8.0 | 0.5 |
| Sell wisdom, not intelligence | Mentor, gap planner, learning ladder, prep rooms, 19 newsletter issues | 6.5 | 1.5 |
| Human-in-the-loop AI ops | Internal practice only; no client-facing artefact | 3.0 | 0.0 |
| A workflow AI depends on | Partner API v1, live, one integration carrying 37% of all users | 7.0 | 2.0 |

**Mean asset 6.6. Mean product 1.0.** That gap is the whole strategy: Myro is
roughly three-quarters of a truth-infrastructure company wearing the skin of a
free consumer job app.

### The number that sets the order of work

**Two verified payments, ever**, out of 24 Razorpay orders. Six rows in
`newsletter_subscribers`. Against that: **one partner integration delivered 281
of 760 users**. The consumer funnel converts attention into nothing; the B2B pipe
converts one integration into a third of the user base. Sequence work by that
asymmetry, not by the philosophy.

---

## THE WAVES

**Wave 0 — stop selling from a broken shop.** *Largely closed 2026-09-06.*
Shivam merged twice (PR #318, #319) and everything below is now in production,
verified live: `/ghost-index` 200, `/ghost-index/method` 200, the index API
serving `ghost-index-v2`, the audit offering 5 slots. `main` trails `Develop` by
a handful of commits at any moment, which is normal.

**Still open from it:** 22 of 24 Razorpay orders died between created and
verified, and nobody knows whether that is abandonment or a broken fulfilment
branch. One real end-to-end purchase would answer it. Until it is answered,
every conversion number on this page has an unexplained hole in it.

**Wave 1 — turn verification into a public institution.** *Shipped 2026-09-05.*
- [Ghost Job Index](https://www.himyro.com/ghost-index) + its versioned method.
  61% of roles closed on an employer's own ATS are still in that employer's own
  feed. Named employers, every rate beside its denominator.
- The partner API is metered (MTR1-6 in [DECISIONS.md](DECISIONS.md)). No price
  yet, on purpose: a month of real numbers first.

**Wave 2 — sell the data slice.** Two packaged slices, not a platform: a sector
hiring panel, and a live-role feed for recruiters and EdTech. The free tier is
the newsletter CSV that already ships; the paid tier is history, freshness and
the API. **Blocked on the licence gate below.**

**Wave 3 — the ₹999 AI Workflow Audit.** *Shipped and live 2026-09-06:
purchasable and deliverable.* The buyer describes an AI workflow they actually run and a human
returns a written audit of it. Chosen over a taught sprint after checking the
code: **practice, quizzes and certificates are free and ungated**, so ₹999 could
not buy access to them without taking away what users already have. What is sold
is a person's attention — the one thing here that does not scale, and therefore
the one thing worth charging for.

That non-scaling is designed for rather than wished away. Intake is bounded at 5
open audits, checked *before* an order is created; a delivered audit cannot
exist without a reviewer's name and sign-off, enforced by a database constraint;
and the model's draft lives in a table the buyer's own token cannot read. This
is bet 4 productised: we sell the human in the loop, and the schema proves the
human was there.

There is **no refund path, by decision**: this is a service business and the
call is the service, so the honest guarantee is the date rather than a
money-back clause.

**The known cost:** every sale carries a per-unit human cost. Fine at ten
buyers, a different company at two hundred. The bound is what keeps that a
choice rather than a discovery. Still owed: a reviewer UI (the workbench is API
plus token today), and an authed eyeball — no surface in this lane has ever been
seen logged in.

---

## WHAT IS ACTUALLY NEXT

Not a wave. Wave 1 is done and live; Wave 2 is gated on a licence question that
is not code. The binding constraint is **299 users who have a CV and no
target** — measured 2026-09-06, and the reason they are stuck is historical, not
behavioural: the door that reaches a target did not exist when they arrived.
Cohorts by month of first upload run 0% (May, 133 users), 20%, 19%, then **62%
in August** once every "Upload CV" pointed at `/onboarding`.

The flow is fixed. Nobody has gone back for the people it was fixed after. They
are the warmest audience on the platform, they already handed over a CV, and
reaching them needs no code. Everything downstream — matching, applying,
tailoring, the ₹99 plan, the audit — is gated behind a target, and once someone
has one the machine works: 77% of them save a job and every saver progresses.

---

## THE GATES

Four things that stop a wave. None is an engineering task.

1. **The taxonomy is licensed.** All 35,108 skills are Lightcast, and every
   job→skill edge is expressed in Lightcast's canonical names. Reselling derived
   data may fall outside that licence. **Confirm the terms before one paid byte
   ships.** If resale is barred, the sellable slice is jobs plus our own
   extraction, with the taxonomy layer replaced or negotiated. Gates Wave 2
   entirely.
2. **Selling data about people has a consent surface.** Job listings are public
   record and safe. Anything derived from CVs, matches or applications is not,
   and PV1 (minimum data, no forced identity) is a promise the data business must
   not quietly break. Aggregate only; no individual-level resale.
3. **Capacity is not launch-ready.** One shared Supabase project serves dev and
   prod, holding 1,118MB against a 500MB recommended tier size. A dataset API
   adds read load to that same instance. Paid compute is a prerequisite.
4. **Built is not sold.** 113 beta feedback items are logged unverified, and the
   ₹99 Job-Switch Plan is offered nowhere in the app. A shipped feature with no
   surface earns nothing.

---

## HOW TO USE THIS FILE

Before building something, ask which bet it moves and whether it moves the
**asset** column or the **product** column. Myro does not need more asset. Work
that only raises an asset score needs a reason to be worked on now.

Two failure modes this file exists to prevent:

- **Building a second company by accident.** AI-ops retainers and org training
  are real revenue with a different cost structure, sales motion and hiring plan.
  They are flagged here, not scheduled. That is a founder's fork, not a ticket.
- **Publishing a number we cannot defend.** Everything in the verification lane
  ships with its denominator, its method version, and what it does not cover.
  The first index metric we computed found every employer maximally guilty and
  turned out to be measuring our own crawl cadence — it was replaced before
  anything read it. Assume the next one is wrong too until it is checked.

**Keeping this true:** when a wave ships, move it to the shipped line and delete
the plan. When a gate clears, delete the gate and say what cleared it. If a claim
here cannot be checked in seconds, it does not belong here.
