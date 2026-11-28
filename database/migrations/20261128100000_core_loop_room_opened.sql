-- A Preparation room, recorded as opened.
--
-- 2026-11-27: a room opened only at `applied`, which 4 real people had reached;
-- 89 had saved a job and 250 had a target role (ARCHITECTURE_ONE_PREP.md §1).
-- The target-role room (P1) opens for the 250. Nothing recorded whether anyone
-- opened a room at all.
--
-- room_opened — PrepShell showed a room: job_id is the job, or 'role' for the
--               target-role room; surface 'job' | 'role'. One per room per visit.
--
-- Additive (widens a CHECK). Reverse: re-add the 20261116100000 list after
-- deleting rows with this step.

begin;

alter table public.core_loop_events drop constraint if exists core_loop_events_step_check;
alter table public.core_loop_events add constraint core_loop_events_step_check check (step in (
    'card_tailor', 'panel_opened', 'panel_tailor',
    'editor_opened', 'mentor_opened', 'downloaded',
    'apply_asked', 'applied',
    'door_shown', 'door_paste', 'door_extension', 'door_fit', 'job_imported',
    'weave_ran', 'review_done',
    'upload_shown',
    'room_opened'
));

notify pgrst, 'reload schema';

commit;
