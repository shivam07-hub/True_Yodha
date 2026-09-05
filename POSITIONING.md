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

**Wave 0 — stop selling from a broken shop.** `main` is behind: production
blanks after a CV upload and large company pages 500. Every number below is
measured on a site that is currently broken. Also: 22 of 24 orders died between
created and verified, and nobody knows whether that is abandonment or a broken
fulfilment branch. *Shivam owns the merge.*

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

**Wave 3 — the sprint, aimed at the buyer we have.** "Run AI Safely", ₹999, two
weeks, sold to the individual jobseeker as CV evidence through the existing
certificate machinery — not to org budget holders Myro has never met (one
institution has ever applied). The org-facing AI Workflow Audit waits until
certificates are in the market and a partner asks for a team edition.

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
