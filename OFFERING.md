# MYRO — What we sell
### The Apply Pack, the Human Check, and how LinkedIn Services joins the product
Rewritten 2026-11-23 (#56 S5) from ENG2 (2026-09-30) and ENG3 (2026-11-22), Shivam.
Cockpit: [CLAUDE.md](CLAUDE.md). Build: [ARCHITECTURE_PAYMENTS.md](ARCHITECTURE_PAYMENTS.md).
The ₹199/month Personalised Engagement this file used to describe is retired;
its contract is in git history (`OFFERING.md` before 2026-11-23).

---

## THE CLOSER

**One-time ₹199 Apply Pack: 500 Myro Coins and one Human Check.** Bought again
when needed. No subscription, no mandate step before value.

People pay at two moments inside the CV machine, and both doors sell the same
pack:

| Door | Moment | Where |
|---|---|---|
| **Fuel** | The coins run out | "Not enough Myro Coins" offers the pack |
| **Stakes** | One job matters enough for a human read | The prep room's On record line: "Human check before you apply" |

**What a Human Check is.** A named reviewer returns it within 24 hours. One of
two kinds, chosen when it is spent:

- **CV check** — the tailored CV read against one job, with a note.
- **LinkedIn rewrite** — headline, About, every role, education, top 5 skills,
  one Featured line, and the rows to delete, written from the CV for the person
  to paste on a short call with the reviewer.

A check bought without either waits until it is spent. When every slot is
taken the buyer sees "ready by" before paying; the clock starts when their slot
opens. A late check is delivered late, not refunded.

**The LinkedIn rewrite on its own: 5,000 coins** (ENG3). That sits above the
3,000 welcome grant on purpose; most people buy the pack and spend its check.

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

Do not add a second SKU on LinkedIn that competes with ₹199.

### What does not cross

**Reach** (the Desk) is the user logging people *they* will message. Myro never
sends. Do not pour Services requests into `reach_targets`, and never sell the
pack as "we will reach people for you".

---

## THE OTHER PRODUCTS

| Product | Price | Buyer |
|---|---|---|
| AI Workflow Audit | ₹999 once | Someone who already runs an AI workflow. A call, bounded at 5 open. Not on the Resume Writing page. |
| Filing intake | ₹599 once | A person, a role, the career pages, and consent. Separate from the pack. |
| Myrology | ₹299 unlock | Its own entitlement and its own sky. |

All three settle through the same Settlement as the pack.

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
