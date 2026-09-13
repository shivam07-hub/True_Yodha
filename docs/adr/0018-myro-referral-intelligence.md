# Myro Referral Intelligence Uses Own-Connections + Strategy, Never Stranger PII

**Status:** Accepted
**Date:** 2026-06-05
**Related:** ADR-0004 (LLM actions cost XP), MYRO_TUTOR_DESIGN.md

## Decision

Per-job referral intelligence ships in two paths:

- **Path 1 — own-connections upload (clean).** The user uploads their *own* exported LinkedIn
  connections archive (Settings → Data Privacy → Get a copy of your data → Connections). Myro
  matches it against the target company and ranks good referrers. User-owned, consented,
  DPDP-clean.
- **Path 2 — XP-gated strategy & outreach (no stranger PII).** When the user knows no one, Myro
  returns *which roles/titles* to target for a referral, drafts the outreach in the user's voice,
  and surfaces *public* signals (e.g., college overlap from the user's own profile). Path 2 is an
  LLM action → costs XP per ADR-0004.

Myro **does not** surface or sell the contact details of strangers.

## Considered Options

- **Scrape LinkedIn for people at the target company:** rejected — flat ToS violation; legal
  exposure; data quality poisoned by anti-scraping.
- **Buy a third-party people-data API to name strangers:** rejected — costly, and processing the
  personal data of non-users who never consented triggers DPDP-Act obligations for *those*
  people. Can revisit only with a compliant, consented provider and explicit legal review.
- **Own-connections + reframed strategy:** accepted — keeps "this is the level of intelligence we
  give" (strategy + a written outreach beats a raw name) while staying ToS- and DPDP-clean.
