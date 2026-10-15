-- The front door's choices, recorded.
--
-- Upload → a job → a tailored CV. Until now the only steps between a CV and
-- a download were ones that already had a job: opening a panel, tailoring,
-- downloading. The door (paste / extension / jobs that fit) happened before
-- any job id existed, so a person who uploaded and never tailored left no
-- row saying which door they stood in front of.
--
-- door_shown, door_paste, door_extension, door_fit fire with job_id
-- 'onboarding' — the step has no listing yet. job_imported carries the real
-- id. All five are client beacons.
--
-- Additive (widens a CHECK). Reverse: re-add the 20261013120000 list after
-- deleting rows with these steps.

begin;

alter table public.core_loop_events drop constraint if exists core_loop_events_step_check;
alter table public.core_loop_events add constraint core_loop_events_step_check check (step in (
    'card_tailor', 'panel_opened', 'panel_tailor',
    'editor_opened', 'mentor_opened', 'downloaded',
    'apply_asked', 'applied',
    'door_shown', 'door_paste', 'door_extension', 'door_fit', 'job_imported'
));

notify pgrst, 'reload schema';

commit;
