# Myro Referral Intelligence Uses Own-Connections + Strategy, Never Stranger PII

**Status:** Accepted (amended 2026-09-15)
**Date:** 2026-06-05
**Related:** ADR-0004 (LLM actions cost XP), ADR-0006 (LinkedIn write-scope), MYRO_TUTOR_DESIGN.md

## Decision

Per-job referral intelligence ships in three paths:

- **Path 1 — own-connections upload (clean).** The user uploads their *own* exported LinkedIn
  connections archive (Settings → Data Privacy → Get a copy of your data → Connections). Myro
  matches it against the target company and ranks good referrers. User-owned, consented,
  DPDP-clean.
- **Path 2 — XP-gated strategy & outreach (no stranger PII).** When the user knows no one, Myro
  returns *which roles/titles* to target for a referral, drafts the outreach in the user's voice,
  and surfaces *public* signals (e.g., college overlap from the user's own profile). Path 2 is an
  LLM action → costs XP per ADR-0004. Myro constructs search URLs the user opens in their own
  browser; it never fetches the result.
- **Path 3 — user-nominated send ledger (2026-09-15).** Paths 1–2 stopped at a copy button. That
  is not delivery. The user pastes a LinkedIn `/in/{vanity}` URL they opened themselves and types
  the name they read there. Myro stores that nomination, fills the three-step sequence (connect /
  follow-up / referral ask) from Path 2 copy when purchased, and records *user-confirmed* states:
  `queued → sent → followed_up → replied | stopped`. Follow-up is due three days after `sent`.
  A nomination may be scoped to a job or sit on the desk with no job (cold reach the user chose).
  Myro never fetches the profile, never sends the message, never holds LinkedIn credentials, and
  never names a stranger the user did not nominate.

Myro **does not** surface or sell the contact details of strangers.

## Still rejected

These were rejected in 2026-06-05 and stay rejected. Path 3 is not a licence to reverse them.

- **Scrape LinkedIn for people at the target company.**
- **Buy a third-party people-data API to name strangers** (Apollo, Proxycurl, and the same class).
- **Unofficial LinkedIn mobile/web APIs, session farms, residential proxies, auto-DM / auto-connect.**
  LinkedIn's partner Messages API itself forbids scheduled or unattended send. `w_member_social`
  (ADR-0006) is posts the user taps, never DMs, never profile writes, never a bot.

## Considered Options

- **Scrape LinkedIn for people at the target company:** rejected — flat ToS violation; legal
  exposure; data quality poisoned by anti-scraping.
- **Buy a third-party people-data API to name strangers:** rejected — costly, and processing the
  personal data of non-users who never consented triggers DPDP-Act obligations for *those*
  people. Can revisit only with a compliant, consented provider and explicit legal review.
- **Own-connections + reframed strategy:** accepted 2026-06-05 — keeps "this is the level of
  intelligence we give" (strategy + a written outreach beats a raw name) while staying ToS- and
  DPDP-clean.
- **Stop at the copy button:** rejected 2026-09-15 — a draft nobody sends is not the loop.
  Path 3 is the send step the user performs; Myro is the ledger.
- **Cloud-send as the user (SalesRobot shape):** rejected 2026-09-15 — same legal wall as scrape.
  The billable service, if one comes, is a human operator using this desk, not a bot.

## Consequences

- Paths 1–2 remain the find-and-draft step. Path 3 is the send step the user
  performs. The product now holds a queue, a due list, and a closed list.
- A nomination is user-typed. Search URLs, Sales Nav URLs, and company pages
  are not Reach Targets. Cap 80 per user.
- Official `w_member_social` (ADR-0006) stays posts the user taps. It does not
  become DMs, profile writes, or a scheduled send.
- The billable E2E service, if staffed, is a human using `/reach`. Staffing
  that service is a later decision, not a licence to automate LinkedIn.

## Implementation (2026-09-15)

- Table `reach_targets`, own-only RLS, unique on
  `(user_id, coalesce(job_id,''), profile_url)`.
- `GET/POST /jobs/reach/targets`, `POST /jobs/reach/targets/{id}/advance`.
- Surfaces: `/reach` (desk), Collections strip, job Reach log, card rail
  “Log who you reached”. Path 2 pack copy fills the notes when purchased;
  logging works with empty notes if it is not.
