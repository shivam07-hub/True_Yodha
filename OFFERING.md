# MYRO — What we sell
### The last CTA, the scene, and how LinkedIn Services joins the product
Locked 2026-09-17 · Shivam. Cockpit: [CLAUDE.md](CLAUDE.md).

This file is the commercial contract. Checkout charges ₹199 / month via
Razorpay Subscriptions (`job_switch_plan` at 19900 paise). New checkouts
503 until `RAZORPAY_ENGAGEMENT_PLAN_ID` is set. The ₹999 audit stays a
different buyer.

---

## THE CLOSER

**The last consumer CTA is a ₹199 / month subscription: Personalised Engagement.**

It is the closer, not an intro, not a decoy under a higher price. The ₹99
one-time Job-Switch Plan is retired as a CTA. The deferred ₹499 / year idea is
retired with it. Two human reviews in 120 days was a one-shot package; this is
a retained person on a living scene.

**What ₹199 buys:** one **Engagement Scene** kept staffed for the month. A
named reviewer makes **one human pass per billing period** against that scene.
Not unlimited rewrites. Not placement. Not us messaging hiring managers.

**What the scene is:** the room they already have, made obviously theirs.

- this job (company, title — the prep room they are in)
- this CV of record, read against that job
- the skill path for that target (the maps at `/skills`)
- a reviewer name and a date

Payment is how the scene stays staffed. The hero is the scene, not a price.

**Why a month, not a package that "gets them the job".** Guidance is ours.
Conversion is theirs. It is not on Myro to hand them the guidance *and* the
job if they cannot convert. A one-shot (₹99, two reviews, 120 days) implied
a finish line we do not own. A month staffs the scene while they try; if they
have not converted, they still need the scene, not a refund because the offer
did not arrive. If they convert, they cancel. That split is the product.

**Honesty:** we make them switch-ready. We do not place them. The job can
vanish; the scene still holds. Copy that promises an outcome (the role, the
interview, the offer) is a bug.

**Cadence:** ₹199 per calendar month, IST, same billing-month rule as MTR4.
Confirmed 2026-09-17. Razorpay Subscriptions: `POST /api/create-order` with
`product=job_switch_plan` opens a subscription (not a one-time order). Recurring
charges arrive as `subscription.charged`. Live charges need the Razorpay plan
id in `RAZORPAY_ENGAGEMENT_PLAN_ID`.

---

## TWO DOORS, ONE QUEUE

HiMyro already has two paid-looking surfaces. They must call each other. They
must not become two companies.

| Door | Who arrives | What they asked for |
|---|---|---|
| **LinkedIn Services** | Cold. They opened HiMyro Career Intelligence and requested *Resume Writing*. | A human to write the CV. |
| **Myro, last CTA** | Warm. CV scored, job collected, they are in the room. | A human to read this CV against this job. |

That is the same work. LinkedIn is already selling it; Myro was selling it as
₹99. The subscription is how both doors charge for it.

### LinkedIn → Myro

A Services request is incomplete until it is a scene.

1. Reply with **one door**: upload the CV, name the job, enter the scene
   (`utm_source=linkedin_services`). Do not write the resume in the LinkedIn
   inbox. A Word doc there creates a customer Myro will never see again.
2. They get a Myro account (PV1 — email is enough). The CV × the named job
   **is** the scene.
3. Last CTA: ₹199 / month. Month 1's human pass **is** the resume they asked
   for, written against that job, delivered in Myro.
4. LinkedIn follow-up names the scene, not an attachment as the product.

Join key when they have one: `linkedin.com/in/{vanity}` — already on
`user_profiles.linkedin_url` and on Reach Targets. A Services request is **not**
a Reach Target (see below).

### Myro → LinkedIn (the operator, not the user)

A subscriber never needs to go to LinkedIn Services to "request resume writing".
The scene is the brief. The operator works the **same review queue** they would
have worked from a LinkedIn request — with a scored CV, a live job, and a gap
path instead of a blank form.

Do not add a second SKU on LinkedIn that competes with ₹199. The Services
listing can stay named **Resume Writing** (that is the query they use).
Fulfilment is the scene.

### What does not cross

**Reach** (People you reached / Desk) is the user logging hiring managers *they*
will message. Myro never sends. LinkedIn Services inbound is strangers asking
*us* for a resume. Opposite direction. Do not pour Services requests into
`reach_targets`. Do not offer the ₹199 closer as "we will reach people for you".

The ₹999 **AI Workflow Audit** is a different buyer (someone who already runs
an AI workflow). It stays a bounded one-shot. It does not belong on the Resume
Writing service page. It is not the last consumer CTA.

**Myrology** (₹299 unlock) stays its own entitlement.

---

## CTA LADDER (consumer)

Free, in order, until they have a scene worth staffing:

1. Upload CV → score → target → matches → collect a job.
2. Skill path is visible. **"Request this learning path"** stays the free
   demand-capture on an incomplete ladder ([PLATFORM_STANDARD_CAREER_TARGET_SKILL_PATH.md](PLATFORM_STANDARD_CAREER_TARGET_SKILL_PATH.md) §4). It is not the closer.
3. Reach stays free: they find the person, they send.

**Last CTA**, only once a job is on record (prep "On record"):

> Keep a person on this scene · ₹199 / month

On the skill-path page, the page-level closer is the same subscription. Do not
replace every request button with a paywall.

On Intel / public teaser: free score first. The paid closer, when it appears, is
₹199 / month engagement — never "₹99 to start".

---

## UNIT ECONOMICS (why the scene has to look expensive)

A LinkedIn resume rewrite sold at ₹199 with month-1 cancel is a ₹199 resume.
Market writing is not that. Months 2–n are what you pay when you have not
converted yet: the scene is still the job in front of you, and conversion is
still yours. That is why it is a month, not a package that ends when we have
"done guidance". The surface must read as retained engagement, not a checkout
for a file.

- One scene per subscriber. One human pass per month. SLA stays 5 working days.
- No refund after that pass is delivered (same logic as the audit: the work
  is the service). Before delivery, full refund — Shivam still confirms this
  against Razorpay when subscriptions are wired.
- Capacity is a bound, not a vibe. Reuse the audit pattern: do not take a
  month we cannot staff. LinkedIn requests wait on the same bound.

---

## BUILD

Checkout is the subscription. Remaining operator work (not code):

- Create the Razorpay monthly plan at 19900 paise; set `RAZORPAY_ENGAGEMENT_PLAN_ID`
  on both Railway backends. Empty = 503 on engagement checkout (safe).
- Webhook events: `subscription.charged`, `subscription.activated`,
  `subscription.cancelled`, `subscription.completed`, `subscription.halted`
  (plus existing `payment.captured`).
- Reviewer email + admin token still required or delivery 503s.
- Kill-switch: `ENGAGEMENT_SALES_ENABLED=false`.

Do not write "sold" until a real charge has landed. The code path is live;
the Razorpay plan id is not.
