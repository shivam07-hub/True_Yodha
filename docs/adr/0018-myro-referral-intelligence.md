# Myro Referral Intelligence Uses Own-Connections + Strategy, Never Stranger PII

**Status:** Accepted (amended 2026-09-15, 2026-10-06, 2026-10-15, 2026-11-22)
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

## Amendment (2026-10-06) — Path 2 reads the job, the caller names it

Path 2's free searches were a stateless `POST /jobs/reach/search` that trusted
the caller to send the title, company and JD. Every caller already held the job
id, and the paid pack already read the job by id, so the same intel had two
input shapes. The extension on a return visit held only the id, sent blanks, and
told the user to "add a company or role" on a page that had both.

- **The free search is `GET /jobs/{job_id}/reach/search`.** Myro reads the job
  from its own record, exactly as the pack does. The body-driven POST is
  deleted; an unknown id is a 404, never an empty search.
- **Reach starts from a saved job in the extension.** The popup's first screen
  is Save only; "Find people to reach" appears once the job has an id. A search
  run against an unsaved page left no Collection entry, so the person it found
  had no job to be nominated against (Path 3) and the job fell out of the loop.
- Nothing about what Myro fetches changes: it still builds the URLs and never
  opens them.

## Amendment (2026-10-15) — two notes, in order

When the person's own connections export is in hand, the pass after they apply is two notes and then it stops (ADR-0026). First, someone they have actually written to. Second, the person whose seat is the motion, even if that thread is cold. The same CV goes with both. The person sends. A longer list is a spray, and this amendment does not authorise one.

## Amendment (2026-11-22) — LinkedIn rewrite is a Human Check

Shivam asked for a one-click LinkedIn profile rewrite, for himself first and
then for every user. One click that *writes* to LinkedIn is not open to us:
Profile Edit needs `w_compliance`, a programme closed to new partners and meant
for FINRA/SEC archiving, and `w_member_social` (ADR-0006) is posts the user
taps. So the rewrite is paid human work that the user pastes, sold inside the
₹199 Apply Pack (ARCHITECTURE_PAYMENTS.md, DECISIONS ENG3). Settled with
Shivam in one grill, 2026-11-22:

| Fork | Decision |
|---|---|
| Cut rule | Keep it. Not a loop step; open by Shivam's call. |
| Door | The CV page, after the Myro Score. 497 people have a score (11-22, own accounts excluded). |
| Who saves on LinkedIn | **The user pastes; our person guides them on a short call.** Nobody logs in as the user and Myro never holds a LinkedIn password. |
| Price | **5,000 coins, or the ₹199 Apply Pack** with its Human Check spent on LinkedIn. 5,000 sits above the 3,000 welcome grant on purpose; no real user held 5,000 on 11-22. |
| Intake | The LinkedIn `/in/{vanity}` URL and a WhatsApp number. Our person reads the public profile in their own browser. **Myro's code never fetches the URL.** |
| Contact | WhatsApp, required, used only to book the paste call, shown only to the reviewer. |
| Who writes | Myro drafts every block from the CV and reservoir when the reviewer claims the check (ADR-0016: nothing the user did not give). Shivam edits and signs off. |
| 24-hour promise | Every block written and waiting in Myro, and the call booked. The clock starts when a check slot opens. |
| Full queue | Show the honest ETA before paying and keep selling. 5 open checks, shared with CV checks. |
| Missed 24 hours | No refund; deliver late. The same as the audit. |
| Scope | Headline, About, every experience entry, education lines, top 5 skills, one Featured line, and a list of duplicate or empty rows to delete. No photo or banner. |
| Build | Claude builds #56 S1–S2 with LinkedIn as the second check kind. Cursor keeps S3–S5. |

**Measured by:** LinkedIn checks delivered, and `pasted_at`, which the reviewer
sets after the call. What changes on LinkedIn itself cannot be seen by Myro.

**Still forbidden.** Myro calling LinkedIn for this, profile writes, holding a
LinkedIn credential, the extension typing into linkedin.com, and anything
scheduled. A paid check is a person helping the user, not a bot acting as them.
