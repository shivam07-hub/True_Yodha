-- mirror_scores.domain_skill_counts — the column the scoring engine has been
-- writing since 2026-07-31 without one existing.
--
-- `8a9741c2 feat(onboarding): target roles from live job families` added
-- `domain_skill_counts` to the ScoreProjection and to `_persist_score`'s payload
-- ([scoring/orchestrator.py](../../backend/app/services/scoring/orchestrator.py))
-- but shipped no migration. Every score write since has died on
--
--   PGRST204: Could not find the 'domain_skill_counts' column of 'mirror_scores'
--
-- The failure is invisible from the app: `onboarding_target_refresh` raises,
-- RQ retries three times, exhausts, and the user sits on "Calculating your Myro
-- Score" forever. `max(computed_at)` on prod is 2026-07-31 05:28 UTC — no score
-- has been persisted for ANY user in three days, and every signup in that window
-- has zero rows in `mirror_scores`.
--
-- Additive, reversible, and it un-breaks prod without a deploy: the code that
-- wants this column is already running.
--
-- Shape: {domain_label: skill_count}. Written by `_score_math`, read by
-- `onboarding_service.get_result` for the score breakdown. Never null — an
-- absent count is `{}` (no skills resolved to a domain), never a missing key.

alter table public.mirror_scores
  add column if not exists domain_skill_counts jsonb not null default '{}'::jsonb;

comment on column public.mirror_scores.domain_skill_counts is
  'Skills the CV proved per scoring domain: {domain: count}. Populated by scoring/orchestrator._score_math; the denominator context for domain_scores.';

notify pgrst, 'reload schema';
