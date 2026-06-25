# Public Community Notes — Design Handoff

**Status:** ✅ IMPLEMENTED 2026-06-25 (branch `Develop`). Migration applied, backend + frontend shipped, 64 backend tests + live RLS checks pass, frontend typecheck clean. Remaining: skill-page rollup (no skill page mounts the feed yet), final copy pass via `ux-copy`, decide rate-limit/XP knobs (currently 3/day, no XP). Original design below.
**Decision locked:**
- *Replace* the private note thread with **public** community notes.
- **All three** entity types go public — `job`, `company`, **and** `skill` (skill notes = shared "how to study toward this" tips, a booster for the next user).
- **Repurpose the existing `comments` table** — do not build a parallel table. Same table, same repo, same `CommentThread` component. Safe to do because there is **zero existing user data** (confirmed by product owner; verify with the count query in §2 before migrating).

**Owner area:** True_Yodha frontend + backend + DB.
**Related:** `docs/REPORT_INACTIVE_FEATURE.md` (the moderation pattern we mirror), `application_reviews` (company-level review cousin — left untouched, see §3).

---

## 1. The reframe

Today the job/company/skill cards show a **private** note thread (`CommentThread`, backed by `comments`, own-only RLS). Users don't trust a "private to you" field on a public posting — it reads like a CRM box nobody asked for.

Flip the whole thing **public**:
- **Job note** — "JD is stale, role open 4 months" / "auto-reject in 2 min, likely a ghost listing."
- **Company note** — "took 3 weeks to hear back" / "panel was 4 rounds."
- **Skill note** — "skip the theory MOOC, build X first" — peer study guidance.

One user writes, every future viewer reads. Notes roll up to the relevant page (company slug page for job/company, skill page for skill).

This is a **publishing surface**, not a notes field. That single fact drives §5 (moderation).

---

## 2. Migration: repurpose `comments` (no new table)

`comments` today (per `20260531_comments`): `id, user_id, entity_type, entity_id, body, created_at, updated_at`. `entity_type ∈ {job, skill, company}`. RLS own-only.

**Pre-flight — confirm clean slate before touching RLS:**
```sql
select count(*) from comments;
```
If non-zero, STOP and re-decide — flipping RLS public would retro-publish those rows. Owner states it's empty; this query is the tripwire.

**Migration (new file, e.g. `20260626_comments_public.sql`):**
```sql
alter table comments add column if not exists status text not null default 'visible';   -- visible | hidden | removed
alter table comments add column if not exists report_count int not null default 0;

-- drop the old own-only read policy, add public read
drop policy if exists comments_select_own on comments;
create policy comments_select_public on comments
  for select using ( status = 'visible' );

-- writes stay own-only (unchanged intent, re-asserted)
-- insert/update/delete policies: with check ( auth.uid() = user_id )
```
Index for the feeds: `(entity_type, entity_id, status, created_at desc)`.

No `visibility` column — everything is public, so there is nothing to gate per-row. (If a "post public / keep private" toggle is ever wanted, *that* is when a `visibility` column gets added. Not now. See §7.)

---

## 3. What stays untouched

`application_reviews` (`companies.py`, `jobs/review.py`) is a **separate, application-gated** post-mortem: you rate a company only after *your* application hits a terminal outcome (offer/rejected/ghosted). It already powers the company page's star avg + ghost rate + stage breakdown. **Leave it.** Public notes are ungated and posting-/skill-scoped — different data, different trust model. The company slug page will show *both*: structured reviews (from `application_reviews`) and free-text notes (from `comments`).

---

## 4. RLS contract (the whole safety story)

| Action | Policy |
|---|---|
| Read | `status = 'visible'` — anyone, incl. anonymous |
| Insert | authed; `with check ( auth.uid() = user_id )` |
| Update | own rows only (`auth.uid() = user_id`) |
| Delete | own rows only → app sets `status='removed'` rather than hard-delete |

**Pinned RLS test (`test_comments_rls`)** — required, it is the tripwire if a policy is ever edited:
1. Anonymous client can read a `visible` row.
2. Anonymous client **cannot** insert.
3. User B **cannot** update or delete User A's row.
4. A `hidden`/`removed` row is **not** returned by the public read.

---

## 5. Moderation / legal — non-negotiable

Public free text about **named companies**. A pseudonym does **not** shield the platform from defamation/harassment claims. Minimum bar before launch:
- **Auth-required to post** (RLS insert policy). No anonymous notes.
- **Per-user rate limit** — start 3/day, backend guard (mirror `job_reports`).
- **Community flag → auto-hide** — `POST …/flag` increments `report_count`; trigger sets `status='hidden'` at threshold (e.g. 5). Same shape as the report → `is_active=false` trigger.
- **Admin takedown** — admin can set `status='hidden'`.
- **ToS UGC clause** — confirm `job_reports` already has user-generated-content terms; extend wording to cover notes.
- Profanity/PII filter on write = nice-to-have, not a launch blocker once flag+hide is live.

---

## 6. Author identity — `ninja_name` (RESOLVED)

Public author label = the user's **`ninja_name`** — the purpose-built pseudonymous identity the product already ships:
- `public_profile_v` view keyed on `ninja_name`
- no-auth `GET /profile/{ninja_name}` (`routers/profile/public.py`)
- user-settable slug with `GET /profile/ninja-name/suggest` generating an available candidate → **generated, not derived from a real name**. This is the "secret / ninja name."

Render the note author as their `ninja_name`, **linked to `/profile/{ninja_name}`** (their public profile is already a shipped surface — let readers click through to see what else this person has shared).

**Do NOT use `display_name`** — that field is used in CV/real-name flows (`users.py`, `cv/*`) and may be a legal name. `ninja_name` is the only correct public label here.

Wiring: the public `GET /comments` read joins author `user_id` → `ninja_name` (via the same `public_profile_v` / `resolve_user_id_by_name` path `profile/public.py` uses). Never return `user_id` or `display_name` in the public payload.

---

## 7. Backend

`comments` router/repo already exist — extend, don't replace.
- `GET /comments?entity_type=&entity_id=` — make **public** (drop the own-user filter; return `visible` rows). Join author `ninja_name` (§6). Never expose `user_id`/`display_name`. Used by job/company/skill feeds alike.
- `POST /comments` (auth) — create; **multi-note allowed** — a user may leave several notes on the same entity (no `UNIQUE` constraint). Rationale: their public profile is visible, so more notes = more signal; don't punish people with more to share. Only guard is the daily rate limit → 429 over cap.
- `PATCH /comments/{id}` (auth, own) — edit body, bump `updated_at`.
- `DELETE /comments/{id}` (auth, own) — set `status='removed'`.
- `POST /comments/{id}/flag` (auth) — increment `report_count`; trigger hides at threshold.

Keep `safe_read` so a not-yet-applied migration degrades to an empty feed instead of 500ing the card.

**Rollups:**
- Company slug page (`GET /companies/{company_name}`): add a `notes` block — `comments` where `entity_type='company'` for that company, plus `entity_type='job'` joined through that company's postings. Sits beside the existing `application_reviews` block.
- Skill page: add a notes section reading `entity_type='skill'`.

---

## 8. Frontend

`CommentThread` is currently a private own-only widget. Fork/extend into a public feed:
- Reads the public list (everyone's `visible` notes, newest-first), shows author `ninja_name` (linked to `/profile/{ninja_name}`) + relative time + a **flag** affordance (replaces the owner-only ✕ delete for non-authors; author still sees edit/delete on their own).
- Logged-out: feed is **read-only** + "Sign in to leave a note" CTA.
- Compose copy per surface (route final strings through `ux-copy`):
  - job: "Leave a note for future applicants…"
  - company: rewrite the current **"Private note on {company}…"** (`companies/[slug]/page.tsx:214`) → public framing, e.g. "Share what you know about applying here…"
  - skill: "Share how you'd actually learn this…"
- **Count badge:** `useCommentCount` already exists — repoint it to the public feed so collapsed cards show "💬 N".
- **Labels:** `detail-body.tsx:178` "Notes · private to you" → public label (e.g. "Notes on this posting" / "What applicants say"). Finalize via `ux-copy`.

---

## 9. Decisions & remaining open questions

**Decided:**
- Notes are **public**, all 3 entity types, single repurposed `comments` table. (§2)
- **Multi-note** per user per entity — no `UNIQUE` constraint. (§7)
- Author label = **`ninja_name`**, linked to public profile; never `display_name`/`user_id`. (§6)

**Still open (don't block the migration; settle before frontend polish):**
1. **Rate limit:** 3/day (match reports) or different?
2. **XP:** none at launch (recommended — text + XP = spam magnet) or reward to drive coverage?
3. **Company-page placement:** notes inline under the review block, or a separate tab?
4. **Label copy** per surface — lock via `ux-copy`.

The migration + RLS + endpoints are now unambiguous; build is mechanical.
