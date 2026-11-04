# Referral Desk — handoff

**From:** Claude (cloud session with Shivam, 2026-10-22) · **To:** the Claude session working in this repo
**Status:** direction agreed with Shivam; nothing built, no code touched. This file is uncommitted.
Fold the decisions into an ADR, then delete this file on the way past.

---

## The ask (Shivam, 2026-10-22)

Shivam can refer people for openings at his employer. He wants Myro to carry referral
openings that users can see and request, so they reach him through Myro for the referral.
He says a referral surface already exists and needs **fine-tuning, not a rebuild**.

## Hard lines — agreed, do not reopen

1. **The employer's internal referral sheet never enters Myro or this repo.** Not the table,
   requisition IDs, grades, bonus amounts or wording. It is marked internal-only, referrals
   must go through the employer's own portal, and a breach risks Shivam's referral
   eligibility and disciplinary action. A listing is written by the referrer in their own
   words. Posting requires an "I'm permitted to share this" confirmation, stored with a timestamp.
   Shivam is checking with his HR whether even that is allowed: **seed no real listing until he says so.**
2. **Myro never submits the referral.** The referrer submits on the employer's official
   portal; Myro is the request ledger.
3. **No contact details exposed either way.** The candidate reaches the referrer through the
   request, never by phone or email.
4. **No government ID numbers collected** (Aadhaar or similar). Candidates bring those to
   the employer's own process.
5. Consistent with ADR-0018: the referrer is a consenting Myro user who chose to post.
   No stranger is named.

## What exists — three things are called "referral"

| Thing | Files | State |
|---|---|---|
| Referral Partner door + workspace preview | `frontend/app/referrals/page.tsx`, `frontend/app/referrals/workspace/page.tsx`, `frontend/components/b2b/referral-dashboard.tsx`, `referral-model.ts`, `frontend/tests/referral-queue-model.test.ts` | Static. Hardcoded invented candidates ("Priya Nair → Rippling"), coin rewards, no backend. Public, `robots: index`, in footer + sitemap via `frontend/lib/site-routes.ts`. Referrer-side. |
| Reach desk (ADR-0018 Path 3) | `reach_targets` table, `backend/app/routers/jobs/reach_targets.py`, `frontend/app/(authed)/reach/page.tsx` | Live. Candidate-side ledger of LinkedIn people the user nominated: `queued → sent → followed_up → replied \| stopped`. |
| Signup invite attribution (DECISIONS SH7) | `frontend/lib/referral.ts`, `?ref=` / `myro_ref` cookie, `user_profiles.referred_by_user_id`, `test_referral_attribution.py`, `test_referral_credit.py` | User-invites-user. Unrelated. New table and route names must not collide with it. |

**Which one Shivam means is not confirmed.** The `/referrals` pair is the referrer-side
match; the candidate's request may belong beside `/reach`. Ask; don't assume.

Seams to reuse (verify each in code before relying on it):
- B2B tenancy is `partners` + `partner_users` (DECISIONS MTR3: no second tenant table).
  A university is a `partners` row.
- `user_notifications` (`kind` is free text) for request / accept pings.
- `services/test_accounts.py` / `is_test_account` for exclusion from counts.
- I found **no partner-admin role** in the migrations I read. Check before designing
  university controls.

## The feature — agreed shape

**Referrer**
- Verified referrer: one-time code to their work email on the employer's domain. Store
  the verified domain and `verified_at`, never the code.
- Listing: company, role family, experience band (min–max years), city, expiry date
  (required; closes the listing), optional 1–3 screening questions, short capped note,
  the attestation above.
- Request inbox: accept / decline with one optional note. After accepting, the referrer
  submits on the official portal off-platform and marks it **submitted**. Outcome optional.

**Candidate**
- Sees only listings they are eligible for (experience band read from their profile/CV).
- "Request referral": answers the screening questions, then gives explicit consent to share
  named items (Myro profile, score, the CV they pick) with **this referrer, for this request
  only**. The consent is a stored record, revocable.
- Status: `requested → accepted | declined → submitted → (outcome)`; can withdraw; pending
  requests expire with the listing.

**Gates**
- Experience band is a hard gate. Screening answers (e.g. "interviewed here in the last
  6 months?") can auto-decline per the referrer's rule.
- Rate limits: requests per candidate per day; open requests per listing; referrer may cap a listing.

**University control**
- Partner admins choose whether referral listings show to their students. Depends on a
  partner-admin role existing (see above). If none exists, raise it in the plan; don't
  invent a role model silently.

**Data**
- RLS: a referrer reads only requests to their own listings; a candidate reads only their own.
  Shared profile/CV is readable by that referrer only while the request is open plus a
  retention window.
- Audit row on every state change (actor, time, from → to).
- Account deletion (see `20260725101706_account_data_deletion.sql`) removes requests, consents
  and listings.
- DPDP: purpose-limited consent, revocable, fixed retention.

## Open decisions — put these to Shivam in your plan

1. Who can post in v1: only Shivam, or any verified employee? (Asked 2026-10-22, unanswered.)
2. Which surface is "the referral surface" to fine-tune: `/referrals` (+ workspace), `/reach`, or both?
3. Retention window for a shared CV/profile after a request closes.
4. The public `/referrals` page shows invented people as candidates on an indexed page.
   Once a real desk exists, does that preview go (delete on the way past) or become the desk?
5. Cut rule: this sits on loop step 2 (Apply). State the reach number `check:reach` needs.

## Cockpit rules that bite here

- **Dev and prod share one database.** Any test listing is production data. Use
  `is_test_account` accounts; never seed a real employer listing while testing.
- Migrations additive, applied before the code that reads them, then `NOTIFY pgrst, 'reload schema';`.
- This is a decision with a privacy surface: an ADR under `docs/adr/` (amending or sitting
  beside ADR-0018) before code is the likely shape.
- No dead ends: whatever ships is linked from a path users walk.
- 375px works; all six gates green.

## First real use

Shivam's first openings are experienced-hire roles (5+ years). Most current Myro users are
students or early-career and won't clear the band, so the eligibility gate matters from the
first listing.
