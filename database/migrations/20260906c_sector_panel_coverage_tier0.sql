-- The coverage counts move off the request path.
--
-- `sector_panel_payload` counted sectors and live roles from `public.jobs` on
-- every read. As `service_role` that is unremarkable; as `anon` it is an 8s
-- statement timeout, because aggregating that table BitmapOrs its RLS policy
-- and rechecks the heap (READ_PATH_PLAYBOOK trap 5).
--
-- This is the SAME mistake the Ghost Job Index made two days ago and fixed the
-- same way, in a payload I wrote after fixing it. The coverage block is the
-- part added last, for honesty, and it is the part nobody measures. The lesson
-- worth keeping: a public payload must touch only its snapshot, and that is now
-- asserted in tests for both surfaces.
--
-- Verified: 8s timeout -> 5.5ms as anon.

alter table public.sector_panel_snapshot
  add column if not exists sectors_tracked integer,
  add column if not exists live_roles_tracked integer;

comment on column public.sector_panel_snapshot.sectors_tracked is
  'Corpus-wide count, written at refresh time under service_role. Counting it '
  'live in the payload cost an 8s statement timeout as anon.';

-- refresh_sector_panel() and sector_panel_payload() are replaced in full; see
-- the applied migration. The refresh computes both tracked counts from the
-- temp table it already builds, so they cost nothing extra, and the payload
-- reads them back from any published row.
