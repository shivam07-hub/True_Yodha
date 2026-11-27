# MYRO — What we sell
### The ₹199 and ₹599 packs, the Human Check, and how LinkedIn Services joins the product
Rewritten 2026-11-23 (#56 S5) from ENG2 (2026-09-30) and ENG3 (2026-11-22), Shivam;
the packs' calls, the ₹599 pack and the gap door from ENG4–ENG6 (2026-11-26).
Cockpit: [CLAUDE.md](CLAUDE.md). Build: [ARCHITECTURE_PAYMENTS.md](ARCHITECTURE_PAYMENTS.md).
The ₹199/month Personalised Engagement this file used to describe is retired;
its contract is in git history (`OFFERING.md` before 2026-11-23).

---

## THE TWO PACKS (ENG5, 2026-11-26)

Both are one-time. Bought again when needed. No subscription, no mandate step
before value. A person reads every check, never only AI.

| | **₹199 Apply Pack** | **₹599 pack** |
|---|---|---|
| Myro Coins | 500 | 500 |
| Human Check (CV against one job, or LinkedIn) | 1 | the CV check **and** the LinkedIn rewrite |
| Calls with the reviewer | 1 · 30 minutes | 3 · the CV, the LinkedIn paste, the search |
| Myro files on company career pages for the role | — | yes (the filing intake, APPLY3) |
| How you use AI in the search, reviewed | — | yes (the scope the ₹999 Audit carried) |

**What a Human Check is.** A named reviewer returns it within 24 hours, then
books the call on WhatsApp. One of two kinds:

- **CV check** — the tailored CV read against one job, with a note, then a
  30-minute call that walks through it.
- **LinkedIn rewrite** — headline, About, every role, education, top 5 skills,
  one Featured line, and the rows to delete, written from the CV for the person
  to paste on the call with the reviewer.

A check bought without a job or a profile waits until it is spent. When every
slot is taken the buyer sees "ready by" before paying; the clock starts when
their slot opens. A late check is delivered late, not refunded.

**The LinkedIn rewrite on its own: 5,000 coins** (ENG3). That sits above the
3,000 welcome grant on purpose; most people buy a pack and spend its check.

### Where people are offered it (ENG6)

| Door | Moment | Where |
|---|---|---|
| **Gap** | They have just seen their Myro Score and their gap | The CV page, right after the score, beside the LinkedIn card: both packs |
| **Stakes** | One job matters enough for a human read | The Preparation room: "Human check before you apply", and both packs |
| **Fuel** | The coins run out | "Not enough Myro Coins" offers the ₹199 pack |

The fuel door has never opened for a real user (nobody below 500 coins as of
2026-11-26); the gap door reaches everyone who uploads.

**Honesty.** We make the paper right. We do not place people, we do not message
anyone for them, and nobody at Myro logs in to their LinkedIn. Copy that
promises the role, the interview or the offer is a bug.

---

## LINKEDIN SERVICES → MYRO

Cold Resume Writing requests on HiMyro Career Intelligence's LinkedIn Services
page are the same work as a Human Check.

1. Reply with one door: `/job-switch-plan?utm_source=linkedin_services` (it
   forwards to `/apply-pack` with the attribution kept), or `/apply-pack`
   directly. Do not write the resume in the LinkedIn inbox.
2. They make a Myro account, upload the CV, and buy the pack.
3. Their check is the resume or the LinkedIn rewrite they asked for, delivered
   in Myro.

Do not add an SKU on LinkedIn that competes with the two packs.

### What does not cross

**Reach** (the Desk) is the user logging people *they* will message. Myro never
sends. Do not pour Services requests into `reach_targets`, and never sell the
pack as "we will reach people for you".

---

## THE OTHER PRODUCT

| Product | Price | Buyer |
|---|---|---|
| Myrology | ₹299 unlock | Its own entitlement and its own sky. |

It settles through the same Settlement as the packs.

**Retired 2026-11-26 (ENG5):** the ₹999 AI Workflow Audit. Its call about how
someone runs AI is part of the ₹599 pack. The ₹599 filing intake is no longer
its own product: it is the ₹599 pack's filing step.

**Not sold to anyone yet (ENG4):** partner access. Partners bring people in for
free; institutions come in through college outreach (`/institutions`).

---

## OPERATOR WORK (Shivam, not code)

- Railway: `HUMAN_CHECK_REVIEWER_NAME`, `HUMAN_CHECK_REVIEWER_EMAIL`. Without the
  name, claiming a check answers 503; without the email, queued checks log a
  warning and only show on `/admin/checks`.
- Razorpay webhook events `payment.captured` and `payment.failed`, secret equal
  to `RAZORPAY_WEBHOOK_SECRET` on both Railway backends.
- Razorpay test-mode keys on the dev backend, or every buy button stays hidden
  there (`not_configured`).
- The reviewer desk is `/admin/checks`, behind the one admin token
  (`JOB_SWITCH_ADMIN_TOKEN`, named for history).

Do not write "sold" until a real charge has landed.
