-- The snapshot table capped locations at 3 while `career_target.MAX_TARGET_LOCATIONS`
-- became 5 (eec3075e). Every direction save reaches `record_career_target`, so a
-- person naming four or five cities would fail the insert and the save would 500.
-- One cap, the code's.
--
-- Loosens a check; no row changes. Reverse (only while no row holds more than 3):
--   alter table public.career_target_snapshots
--     drop constraint career_target_snapshots_locations_cap,
--     add constraint career_target_snapshots_locations_cap check (cardinality(locations) <= 3);

begin;

alter table public.career_target_snapshots
    drop constraint career_target_snapshots_locations_cap,
    add constraint career_target_snapshots_locations_cap
        check (cardinality(locations) <= 5);

commit;
