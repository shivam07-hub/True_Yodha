-- The matcher's scoping key held job titles nobody could match against.
--
-- `_normalize_families` trimmed and de-duped whatever a caller sent as
-- `role_families` and never asked the corpus whether the string named a real
-- direction, so raw typed titles were written into `target_roles` — the key the
-- matcher runs on. The forward fix is `15a6d7fd` (targeting_write drops unknown
-- families at the one write door). This repairs the rows written before it.
--
-- MEASURED on prod 2026-09-14, confirmed unchanged 2026-09-15:
--
--   users with a scope                                         159 -> 162
--   keys naming no real family                                  41
--   users with at least one phantom                              36  (23%)
--   users whose scope was ENTIRELY phantom                       29  (18%)
--
-- The stored values were "seo", "hr", "any", "marketing", "Content writer",
-- "Teacher or a tele caller", "undergraduate student studying BBA".
--
-- WHY IT WAS SILENT. `get_candidate_job_ids_for_roles` is an equality on
-- `jobs.role_family`, so an all-phantom scope returned zero role-right jobs and
-- the Match Run fell back to skill overlap alone. `role_family_demand` returned
-- no market, so the score and the prep plan had no role-backed target either.
-- And `current_snapshot` does not validate the family, so `needs_target` stayed
-- false and those 29 users were never asked again — the break was permanent.
--
-- ⚠️ RESOLVING A TITLE BY STRING MATCH IS NOT THE REPAIR. Measured against the
-- real stored values, ILIKE gives "sales" -> Customer Service, "Intern" ->
-- Internal Controls, "any" -> Company, Product, and Service Knowledge. The
-- family comes from corpus-backed discovery or it does not come at all
-- (`save_target`, #145). So this drops; it never guesses.
--
-- The typed TITLE survives in `target_role_titles`, which is what Settings,
-- Practice and the score header render. Only the scope is cleaned.
--
-- Shivam's call, 2026-09-15: drop the phantoms, let the 29 be re-asked, and say
-- nothing — they meet the ordinary Direction journey, which now opens on the
-- band step with fit-ranked suggestions and lets them choose for themselves.

create table if not exists public.phantom_scope_repair_20260915 (
  user_id              uuid primary key,
  target_roles_before  text[] not null,
  target_roles_after   text[] not null,
  snapshot_id          uuid,
  snapshot_family      text,
  snapshot_superseded  boolean not null default false,
  repaired_at          timestamptz not null default now()
);

comment on table public.phantom_scope_repair_20260915 is
  'Before/after of the 2026-09-15 repair that removed non-existent role families '
  'from user_profiles.target_roles. Restore from here if needed. Keep until the '
  '29 cleared users have re-picked a direction.';

insert into public.phantom_scope_repair_20260915
  (user_id, target_roles_before, target_roles_after, snapshot_id, snapshot_family)
select p.id,
       p.target_roles,
       coalesce(array(
         select f from unnest(p.target_roles) f
         where exists (select 1 from public.role_family_labels l where l.family = f)
       ), array[]::text[]),
       s.id,
       s.l2_role_family
from public.user_profiles p
left join public.career_target_snapshots s
       on s.user_id = p.id and s.superseded_at is null
where exists (
  select 1 from unnest(p.target_roles) f
  where not exists (select 1 from public.role_family_labels l where l.family = f)
)
on conflict (user_id) do nothing;

update public.user_profiles p
set target_roles = r.target_roles_after
from public.phantom_scope_repair_20260915 r
where r.user_id = p.id
  and p.target_roles is distinct from r.target_roles_after;

-- A snapshot naming a family that does not exist keeps `needs_target` false, so
-- the user is never re-asked. Superseding it is the mechanism
-- `record_from_profile` already uses for a cleared direction: the Direction
-- journey opens on their next visit and they choose for themselves.
update public.career_target_snapshots s
set superseded_at = now()
where s.superseded_at is null
  and s.l2_role_family is not null
  and not exists (
    select 1 from public.role_family_labels l where l.family = s.l2_role_family
  );

update public.phantom_scope_repair_20260915 r
set snapshot_superseded = true
where r.snapshot_id is not null
  and exists (
    select 1 from public.career_target_snapshots s
    where s.id = r.snapshot_id and s.superseded_at is not null
  );

-- APPLIED to prod 2026-09-15. Result: 36 users repaired, 7 kept a real family,
-- 29 cleared, 14 snapshots superseded, 0 phantom keys and 0 phantom snapshots
-- remaining.
