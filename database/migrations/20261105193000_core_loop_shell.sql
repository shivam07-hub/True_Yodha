-- Which shell took the step: the browser, or the Android app.
--
-- Null on rows written before this column, and on a server step that had no
-- client shell to copy. Not backfilled: a person is counted when they next
-- take a step inside the app.
--
-- Reverse: alter table public.core_loop_events drop column if exists shell;

begin;

alter table public.core_loop_events
    add column if not exists shell text;

alter table public.core_loop_events
    drop constraint if exists core_loop_events_shell_check;

alter table public.core_loop_events
    add constraint core_loop_events_shell_check
    check (shell is null or shell in ('web', 'android'));

comment on column public.core_loop_events.shell is
    'web or android, set by the client beacon. Null when the writer had no shell.';

notify pgrst, 'reload schema';

commit;
