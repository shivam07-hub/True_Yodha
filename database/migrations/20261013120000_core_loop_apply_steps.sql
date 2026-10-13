-- The Apply step's two blind spots, recorded.
--
-- 2026-10-13: 21 Apply clicks ever, 0 "Did you apply?" answers, and only 1 of
-- the 14 real people who clicked came back a day later. Two facts were not
-- recorded anywhere, so the 0 could not be read:
--
--   apply_asked  the "Did you apply?" prompt actually rendered (web / mobile
--                beacon, with its surface) — "never came back" vs "saw it,
--                ignored it".
--   applied      the first move of a job to `applied`, written by the SERVER
--                where the fact happens, with the door the caller names
--                (extension, apply prompt, tracker, prep, CV export). A client
--                cannot send this step; `CoreLoopStepPayload` rejects it.
--
-- The vocabulary is tied to CORE_LOOP_STEPS (app/services/core_loop.py) and
-- the TypeScript `CoreLoopStep` union by test_telemetry_vocabulary.py.
--
-- Additive (widens a CHECK). Reverse: re-add the 20260928150000 list after
-- deleting rows with the two new steps.

begin;

alter table public.core_loop_events drop constraint if exists core_loop_events_step_check;
alter table public.core_loop_events add constraint core_loop_events_step_check check (step in (
    'card_tailor', 'panel_opened', 'panel_tailor',
    'editor_opened', 'mentor_opened', 'downloaded',
    'apply_asked', 'applied'
));

notify pgrst, 'reload schema';

commit;
