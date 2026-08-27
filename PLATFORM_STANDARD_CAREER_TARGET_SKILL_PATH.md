# Myro Platform Standard: Career Target → Skill Path

**Audience:** Cursor, Claude, and Codex
**Owner:** Product/CEO-approved contract
**Status:** Product decisions locked; implementation remains
**Branch:** `Develop`

This document is the implementation contract for making Myro feel like one
platform. Do not reopen the product decisions below. Inspect the existing code
and migrations first, extend the current seams, and remove duplicate derivation
paths as each slice lands.

## Product promise

Myro shows a learner, truthfully and in one consistent language:

1. what their current CV proves;
2. what the selected role requires in the live market; and
3. which neighbouring skills they can practise, assess, certify, and add to
   their CV.

The same target and skill-path data must power onboarding, score, Jobs, Skills,
learning, certificates, CV Playground, and notifications.

## Locked contract

### 1. Canonical career target

`CareerTargetSnapshot` is the unit of truth for a direction change. It stores:

- human role title from the live job corpus;
- L1 career area;
- L2 role family key;
- source seniority band;
- up to three role-scoped locations, OR-ed for job retrieval;
- the CV baseline that was active when the target was chosen;
- created/superseded timestamps.

The six source seniority values are the only new vocabulary:

`intern`, `entry`, `mid`, `senior`, `lead`, `executive`.

Firecrawl/Supabase is the source of job-card seniority. Myro must consume the
same value; it must not create a second title heuristic or enum. Legacy `any`
values may remain only as compatibility data while the user is explicitly
re-onboarded.

The chosen band is the anchor. Show exactly one lower and one higher band when
available, as separate views. The anchor alone drives the score, primary gap
plan, and primary recommendations.

All users must complete the standardized target flow before receiving a
refreshed score, skill path, or personalized matches. Existing CVs, saved jobs,
and account settings remain readable while the flow is incomplete.

### 2. Canonical taxonomy and skill states

The taxonomy is:

`L1 career area → L2 role family → L3 atomic skill → L0–L5 proficiency`.

Use plain-language UI labels (“Career area”, “Role family”, “Skill level”), not
raw L1/L2/L3 labels.

Every skill path card has exactly one state:

- **On your CV** — confirmed in `user_skills` for the current baseline and has
  evidence text. Show the evidence pointer and CV-derived level.
- **Practised** — progress exists in `skill_assessed_level`, but it is not CV
  evidence. It must not silently change score or matching.
- **Not evidenced** — no trustworthy CV evidence. Do not call it “missing” when
  the distinction matters.

Passing an assessment can produce a Myro certificate. It does not silently edit
the CV or promote a CV-derived level.

### 3. Market demand and neighbouring skills

Demand is calculated only from trusted-active jobs and the selected target
band/family. Reuse the existing role-family market read model; do not create a
second corpus-wide demand calculation.

- **Core role skill:** appears in at least 20% of active roles in that band and
  family.
- **Neighbouring skill:** appears in at least 5% and at least 5 active roles.
- Below the threshold, do not present it as a recommended neighbour.

Keep the three band maps separate:

- lower band = ready-now roles and their distinguishing skills;
- anchor band = score and primary learning path;
- higher band = next-step roles and additional skills.

The default UI uses a demand meter, quiet role count, and `Core`/`Often
requested` badge. Do not render explanatory prose such as “required by 42 of
310 roles.” Preserve exact numerator/denominator data for accessible tooltip or
expanded detail.

### 4. Learning availability and demand capture

Show every evidence-backed gap. Only a complete, source-grounded L1–L5 ladder
gets a practice CTA. An unavailable ladder gets one action:

**“Request this learning path”**

After submission, show:

**“Demand recorded, we’ll let you know as soon as the assessment is live.”**

The request is idempotent per user + L3 skill, stores the target snapshot and
seniority context, and can be withdrawn. When a complete ladder becomes
servable, create one in-app notification through the existing notification
inbox. Do not imply email, WhatsApp, or push until those channels exist and are
opted into.

Learning progress remains in `skill_assessed_level`. It must not mutate
CV-derived `user_skills`, score, or matching without the explicit certificate
promotion flow below.

### 5. Assessment win screen and certificate

The passing assessment win screen issues an immutable **Myro Skill Certificate**
with:

- skill and achieved L1–L5 level;
- pass date;
- assessment edition/attempt reference;
- verification identifier or URL.

It must not claim university, employer, or industry accreditation.

The win screen offers **Download certificate** and **Add to CV**. Add to CV
opens CV Playground with a factual Certifications entry. The user reviews and
saves it. Saving creates a new immutable CV baseline; only then may score and
matches recompute. Never invent an issuer, date, result, or evidence.

## Existing foundations to reuse

Before adding code, inspect these current seams and migrations:

- `role_family` and role-family label snapshot:
  `database/migrations/20260731_job_role_family.sql`,
  `database/migrations/20260825100000_role_family_label_snapshot.sql`;
- scoped demand:
  `database/migrations/20260803b_role_family_market_skills.sql`;
- multi-location targets:
  `database/migrations/20260602_multiloc_target_locations.sql`;
- target freshness:
  `database/migrations/20260804_target_updated_at.sql`;
- centralized target writer: `backend/app/services/targeting_write.py`;
- role picker: `frontend/components/target-role/role-family-picker.tsx`;
- ladder/question truth: `skill_questions`, `skill_assessed_level`, and
  `backend/app/services/upskilling_service.py`;
- in-app notifications: `user_notifications`,
  `backend/app/repositories/notifications.py`, and
  `backend/app/routers/notifications.py`;
- CV versioning and explicit edits: `cv_versions` and CV Playground paths.

Do not duplicate `target_roles`, title ILIKE matching, role labels, seniority
normalization, city lists, or learning-demand calculations. `target_roles` is a
compatibility projection until every consumer reads the canonical snapshot.

## Required implementation slices

### Slice A — persistence and derivation

1. Add an additive target-snapshot migration if the existing target-history
   model is insufficient.
2. Add an additive learning-path-demand request table with owner-only RLS,
   unique active `(user_id, taxonomy_key)`, target snapshot context, and
   fulfillment timestamps.
3. Add an immutable certificate table linked to assessment attempt/edition and
   user. Do not rewrite attempts.
4. Make the centralized target writer the only writer for role, family,
   seniority, location arrays, target freshness, and compatibility projections.
5. Verify the Firecrawl seniority field is carried into Myro `jobs` and used by
   job-card eligibility. Do not map by title in Myro.

### Slice B — one backend read contract

Create one authenticated response/read model (name it consistently in code)
that returns:

- current target snapshot and lower/anchor/higher bands;
- role label, family, L1 area, seniority, and locations;
- per-band demand totals;
- skill cards with state, current level, required level, evidence pointer,
  demand meter/count, ladder availability, and certificate status;
- the server-selected next action.

Onboarding, score, Jobs, Skills, learning, CV Playground, and notifications must
consume this contract or a narrowly scoped projection of it. No frontend may
recompute these facts from array order, title text, or hardcoded fallback data.

### Slice C — standardized user journeys

1. Gate every user without a current canonical target into the short target
   flow; preserve drafts and existing work.
2. Replace old target controls with the shared role-family picker and source
   seniority chips.
3. Render the three band-specific skill maps with the meter/count/badge pattern.
4. Add the request CTA and notification fulfillment.
5. Add the assessment win-screen certificate and reviewed CV promotion.
6. Ensure target changes create a new snapshot and invalidate only future score,
   gap, and recommendation projections; saved applications remain intact.

### Slice D — remove split-brain paths

After consumers migrate, remove or quarantine:

- title ILIKE aspiration derivation;
- hardcoded role or city presets;
- duplicate seniority mappings;
- frontend-only score/gap/availability inference;
- any learning write that mutates CV-derived matching truth without explicit
  certificate promotion.

Use `rg` before deletion and include regression tests proving no remaining caller
depends on the retired path.

## Acceptance criteria

- Every authenticated user either has a current target snapshot or sees the
  target gate before refreshed score/matches.
- A job card and a target chip use the same six-band seniority value.
- A target change leaves the old score history explainable by its old snapshot.
- The same role/family/location/seniority facts render identically across all
  surfaces.
- A skill’s “On your CV” state always has current-baseline evidence.
- A passed assessment creates a certificate but does not alter `user_skills`
  until the user reviews and saves Add to CV.
- Demand requests are idempotent, owner-scoped, withdrawable, and produce one
  in-app notification when the ladder is live.
- Neighbor cards meet the threshold and expose exact evidence only through
  compact visual detail/accessible expansion.
- Unknown or unavailable data is omitted or labelled unknown; no zero/default
  is used to imply entry-level, no ladder, or no demand.

## Verification and rollout

Run the repository gates before each slice is called complete:

```bash
source .venv/bin/activate
PYTHONPATH=backend pytest backend/tests
ruff check <owned backend files>
cd frontend && npx tsc --noEmit && npm run lint && npm test
npm run check:ui-drift && npm run build
```

For Supabase changes: use an additive migration, apply it in the same session,
reload PostgREST, inspect migration history plus the actual columns/indexes/
constraints/functions/RLS, and run a live spot-check. Never expose certificate
answer keys or private user evidence through public endpoints.

Commit each green slice with one scoped Conventional Commit and push to
`Develop`. Do not claim product closure from local tests alone. Record separately
the commit, live migration, deployed versions, authenticated desktop/mobile
validation, demand/notification metrics, and affected-user confirmation.

## Non-goals

- No LLM role-family or seniority classification.
- No feed Best-fit rewrite until separately measured and approved.
- No automatic CV fabrication or automatic certificate insertion.
- No external notification channel promise in v1.
- No public exposure of CV text, private skill evidence, assessment answers, or
  user email.
