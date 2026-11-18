-- The upload screen, recorded as shown.
--
-- 2026-11-12: 59 of 101 new signups never uploaded, and none of them started
-- one. All 59 have no `user_onboarding_state` row, so nothing says whether the
-- upload screen even rendered for them (ARCHITECTURE_RETENTION.md R6).
--
-- upload_shown — `ExperienceStep` rendered the upload for a signed-in person
--                (a client beacon, job_id 'onboarding' as `door_shown` uses).
--
-- Additive (widens a CHECK). Reverse: re-add the 20261020090000 list after
-- deleting rows with this step.

begin;

alter table public.core_loop_events drop constraint if exists core_loop_events_step_check;
alter table public.core_loop_events add constraint core_loop_events_step_check check (step in (
    'card_tailor', 'panel_opened', 'panel_tailor',
    'editor_opened', 'mentor_opened', 'downloaded',
    'apply_asked', 'applied',
    'door_shown', 'door_paste', 'door_extension', 'door_fit', 'job_imported',
    'weave_ran', 'review_done',
    'upload_shown'
));

notify pgrst, 'reload schema';

commit;
