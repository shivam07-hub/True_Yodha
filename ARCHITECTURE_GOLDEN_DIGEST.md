# The golden list and its digest

**Architecture spec #59. Implementation by Cursor. Written 2026-10-02 from the
CEO grill (D5, D8, Shivam, 2026-09-30).** This is #55's email slice (S4),
narrowed to the people Shivam picks.

> **VERIFY IN CODE before building.** Line numbers are from `a213fee2`. Each
> slice is its own commit on `Develop`, six gates green. Migrations are applied
> by the agent before the code that reads them, then `NOTIFY pgrst`.

---

## 1 · The decisions

- **The golden list is the instant-seeker list** — the people Shivam names as
  job-hunting right now. **One column, no new table** (Shivam):
  `user_profiles.golden_list_since timestamptz` — empty means not on the list.
- Shivam sends names; an agent matches each to an account and shows him the
  candidates; **Shivam confirms**; the agent stamps the column. Removing a person
  clears it.
- The digest email goes **only** to active golden-list members.
- **What it says, in order:** (1) "You tailored a CV for {role} at {company} —
  apply →", for job CVs they made but never applied with; (2) up to three new
  jobs worth applying to, each with a **Tailor CV** link.
- **When:** at most once every 3 days, and only when there is something to say.
- **One-click unsubscribe.** 0 judge calls — it reads what already exists.

## 2 · Facts this rests on (read 2026-10-02)

- No email preference or unsubscribe mechanism exists anywhere in the code.
- `email_service.send_email(*, to, subject, text)` (`services/email_service.py:28`)
  is the one sender — text only, Resend.
- Scheduled work runs as GitHub Actions that execute backend code directly —
  `.github/workflows/notice-closer.yml` (daily 02:00 UTC) is the pattern.
- `user_notifications` (kind, title, body, job_id, action_url, state, read_at,
  created_at) is the in-app record the bell reads; `announce_fresh`
  (`services/matching/match_run.py:137`) is the one writer for match news.
- Myro's own accounts carry `is_test_account` and are excluded from everything
  here automatically.

## 3 · Data (migration M1, additive)

- `user_profiles.golden_list_since timestamptz null` + a partial index
  `where golden_list_since is not null`.
- `user_profiles.digest_unsubscribed_at timestamptz null`.
- **Each send is recorded as a `user_notifications` row**, `kind =
  'golden_digest'`, carrying the same lines the email carried. That row is the
  cadence check, the claim against a double send, and the in-app copy. No send
  log table.

## 4 · The module — `backend/app/services/golden_digest.py`

```python
def compose(user_id: str, *, since: datetime, store: DigestStore) -> Digest | None
def send_due(now: datetime, *, store: DigestStore, mailer: Mailer, apply: bool) -> SendReport
```

`compose` — reads only:

1. **Unfinished:** job documents (`cv_versions.job_id is not null`) whose job has
   no `job_applications` row in `applied · interviewing · rejected · ghosted`,
   and whose listing is not closed (the listing-time verdict). Newest first, at
   most 2. Link: the job's page, where Apply is the next step.
2. **New worth applying to:** `user_job_matches` with `recommendation in
   ('Apply', 'Negotiate')` and `overall_score >= 3.5` — the same "qualified" line
   as the north star (prod: Apply 3.70–4.82, Negotiate 3.60–4.20) — written after
   `since`, admitted by `admission.py`, not already collected. Top 3, each with
   `/cv?jobId=…`.
3. Nothing in either → `None`. No email.

`send_due` — for each member with `golden_list_since` set, not unsubscribed, not
`is_test_account`, and no `golden_digest` row in the last 3 days:
**claim first** (insert the row with `state = 'sending'`; a unique day key per
person refuses a second claim), compose, send, set `state = 'emailed'` (or
`'failed'` with the reason). `apply=False` prints what would be sent and writes
nothing. `DigestStore` and `Mailer` each have a Supabase/Resend adapter and an
in-memory one — tests run `send_due` end to end without a network.

Runs from `.github/workflows/golden-digest.yml`, daily at **03:30 UTC (09:00
IST)**, `python -m scripts.golden_digest --apply`, with the secrets
`notice-closer.yml` already uses plus `DIGEST_UNSUBSCRIBE_SECRET`.

## 5 · Unsubscribe — one click, no login

- Every email ends with `https://himyro.com/unsubscribe?t=<token>`, where the
  token is an HMAC of the user id and the purpose `digest` with
  `DIGEST_UNSUBSCRIBE_SECRET`.
- Public `POST /email/unsubscribe {t}` sets `digest_unsubscribed_at`. A small
  public page `/unsubscribe` confirms in one line.
- `send_email` gains an optional `headers` argument so the digest carries
  `List-Unsubscribe` and `List-Unsubscribe-Post` (one-click, RFC 8058).
- Reach allowlist: `/unsubscribe` under `external` — "entered from an email".

## 6 · Managing the list — `backend/scripts/golden_list.py`

`list` · `match "<name>"` (prints candidates: name, email, signup date, CV,
tailored, applied — never writes) · `add <user_id>` / `remove <user_id>`
(write only with `--apply`). Repeatable without hand-written SQL. Seed batch 1 —
Rishabh Guha, Adarsh Mohan, Raj Kishore, Deveshwar Kashyap — **only after
Shivam confirms the matches**.

## 7 · Platform sweep

| Surface | What this spec requires |
|---|---|
| Email clients, phone first | Plain text v1; short lines; links are full URLs |
| Links | `?utm_source=golden_digest` on every link so the return is measurable |
| Bell | The `golden_digest` row shows in-app too |
| Phone / PWA | Links open the web routes; nothing app-specific |
| #55 Return Loop | The digest links into /market and `/cv`; #55 S1–S3 make sure the list they land on is there |
| Legal | DPDP note sits in BACKLOG → Company obligations; the unsubscribe ships with the first email |
| Test and founder accounts | Excluded by `is_test_account`; `--preview-to <email>` sends one member's digest to an operator inbox for QA |

## 8 · Work, in order

| # | Slice | Done when |
|---|---|---|
| S1 | M1 + `golden_list.py`; seed batch 1 after Shivam confirms | `list` prints the 4 members |
| S2 | `compose` with the in-memory store | Tests: unfinished first; closed listings and collected jobs skipped; nothing → `None` |
| S3 | `send_due`, unsubscribe endpoint + page, `send_email(headers=)`, the workflow | Tests: never twice in 3 days; unsubscribed and test accounts skipped; a failed send is recorded |
| S4 | `--preview-to` Shivam's inbox for all 4 members | **Shivam approves the first live send** |

## 9 · How we will know it worked

Digests sent and unsubscribes per week; clicks via `utm_source=golden_digest`;
and the one that matters — golden-list members' tailored → applied conversion
against where they were on 2026-09-29 (batch 1: 0 of 4 tailored, 0 applied).
