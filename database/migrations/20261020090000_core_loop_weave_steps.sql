-- The two steps between opening Mentor and downloading, recorded.
--
-- 2026-10-19: of 6 real people who opened the tailor editor, 2 opened Mentor
-- and 1 downloaded — and for the one who opened Mentor and did not download,
-- nothing said whether the weave ran or the review was left half-done.
--
-- weave_ran   — a Mentor weave produced a proposal (the server, on success).
-- review_done — the last card of that proposal was decided (the server, on
--               the landing that completed it).
-- Both are server steps (core_loop.SERVER_STEPS): a beacon can be lost to a
-- closed tab, and the server is where each fact happens.
--
-- Additive (widens a CHECK). Reverse: re-add the 20261014193000 list after
-- deleting rows with these steps.

begin;

alter table public.core_loop_events drop constraint if exists core_loop_events_step_check;
alter table public.core_loop_events add constraint core_loop_events_step_check check (step in (
    'card_tailor', 'panel_opened', 'panel_tailor',
    'editor_opened', 'mentor_opened', 'downloaded',
    'apply_asked', 'applied',
    'door_shown', 'door_paste', 'door_extension', 'door_fit', 'job_imported',
    'weave_ran', 'review_done'
));

notify pgrst, 'reload schema';

commit;
