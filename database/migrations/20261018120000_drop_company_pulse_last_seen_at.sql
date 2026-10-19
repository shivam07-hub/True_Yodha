-- company_pulse_snapshot.last_seen_at has no writer and no reader.
--
-- Pulse is volume and momentum only (DECISIONS PULSE1, 20261007090000).
-- refresh_company_pulse stopped writing this column in 20261006090000, and
-- the pulse select on both main and Develop names only sort_key, open_roles,
-- weekly_delta, inflow_by_day (checked 2026-10-18, main at bc6bb1f7).
-- Shivam: standing yes, 2026-10-07.
--
-- Reverse: add the column back nullable; the next refresh leaves it null.
-- Nothing is lost — the snapshot is rebuildable from jobs.

alter table public.company_pulse_snapshot
  drop column if exists last_seen_at;

notify pgrst, 'reload schema';
