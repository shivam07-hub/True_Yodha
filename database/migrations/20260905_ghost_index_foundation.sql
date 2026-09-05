-- Ghost Job Index — evidence foundation.
--
-- The index answers one question in public: when an employer's own ATS says a
-- role is gone, how long does the employer's own feed keep advertising it?
--
-- Everything here exists because the raw observation ledger CANNOT be published
-- as-is. Between 2026-07-11 and 2026-08-13 the verifier recorded 19,252 `closed`
-- observations against Workday URLs that carried no site segment
-- (`tenant.wdN.myworkdayjobs.com/job/...` instead of `.../{lang}/{site}/job/...`).
-- Such a URL can never address a listing, so a 404 from it is evidence about
-- ROUTING, not about the role. Those closes were reverted on the jobs rows —
-- production confidence is clean — but the observation history still carries
-- them, and they are 51% of every `closed` observation ever recorded.
--
-- Publishing an index over that history would report Accenture, Genpact and
-- Target as mass-closing roles they never closed. So admissibility is encoded
-- once, in SQL, as a rule about evidence quality — not as a date range, and not
-- in application code where it could drift from the numbers already published.

-- ── the admissibility rule ──────────────────────────────────────────────────

create or replace function public.close_evidence_is_admissible(p_evidence jsonb)
returns boolean
language sql
immutable
as $$
  select not (
    coalesce(p_evidence ->> 'provider', '') = 'workday'
    and coalesce(p_evidence ->> 'final_url', '') ~ 'myworkdayjobs\.com/job/'
  );
$$;

comment on function public.close_evidence_is_admissible(jsonb) is
  'Whether a `closed` observation may count as evidence a role ended. False for '
  'a site-less Workday URL: it never addressed the listing, so its 404 says '
  'nothing about the role. Rule lives here so the published index and any '
  'audit of it read the same definition. Part of method ghost-index-v1.';

-- ── admissible close events, one row per listing ────────────────────────────

create or replace view public.listing_close_events as
select
  o.job_id,
  min(o.observed_at)                                   as closed_at,
  count(*)                                             as close_observations,
  bool_or(o.strength = 'strong')                       as has_strong_evidence,
  max(o.verifier_version)                              as verifier_version
from public.job_listing_observations o
where o.result = 'closed'
  and public.close_evidence_is_admissible(o.evidence)
group by o.job_id;

comment on view public.listing_close_events is
  'One row per listing the verifier conclusively found gone, on admissible '
  'evidence only. `closed_at` is when WE first saw it gone, never when the '
  'employer closed it — the index must never claim the latter.';

-- ── feed presence, from the scraper half of the ledger ──────────────────────
--
-- `jobs.last_seen` is NOT usable here: it equals `first_seen` on all 72,500
-- rows — it is the ingest date wearing a liveness name. Feed presence comes
-- from the scraper's own observations, which is the only re-observation signal
-- that exists.

create or replace view public.listing_feed_presence as
select
  job_id,
  max(observed_at) filter (where result = 'seen_live')      as last_in_feed,
  min(observed_at) filter (where result = 'source_missing') as dropped_from_feed,
  count(*) filter (where result = 'seen_live')              as feed_observations
from public.job_listing_observations
where observer = 'scraper'
group by job_id;

comment on view public.listing_feed_presence is
  'When the employer feed last carried a listing, and when it stopped. Sourced '
  'from scraper observations because jobs.last_seen carries no liveness.';

-- ── the snapshot the public index reads ─────────────────────────────────────

create table if not exists public.ghost_index_snapshot (
  scope           text not null check (scope in ('overall', 'company', 'sector')),
  -- 'overall' for the corpus row; company name or industry_group otherwise.
  scope_key       text not null,
  period          text not null,  -- 'all' or 'YYYY-MM' of the close event

  -- Denominators, published beside every rate. A rate without the count it was
  -- taken over is the kind of number this index exists to argue against.
  listings_conclusive integer not null default 0,
  listings_closed     integer not null default 0,
  listings_live       integer not null default 0,
  listings_inconclusive integer not null default 0,

  -- The ghost measurement. `feed_overlap` is the true denominator for
  -- `ghost_rate`: only a listing we watched on BOTH sides can be judged.
  feed_overlap    integer not null default 0,
  ghost_listings  integer not null default 0,
  ghost_rate      numeric(4, 3),
  avg_ghost_days  numeric(5, 1),
  median_ghost_days numeric(5, 1),
  never_dropped   integer not null default 0,

  -- How long a role stayed advertised before we saw it close.
  median_advertised_days numeric(5, 1),

  method_version  text not null,
  computed_at     timestamptz not null default now(),
  primary key (scope, scope_key, period)
);

comment on table public.ghost_index_snapshot is
  'Ghost Job Index, precomputed. Public aggregate over public job listings: no '
  'user data, no PII. Every rate ships with its denominator and a method '
  'version, so a figure quoted from it stays checkable after the method moves.';

comment on column public.ghost_index_snapshot.listings_inconclusive is
  'Listings we could not reach a verdict on. Published, not hidden: it is the '
  'honest bound on everything else in the row.';

comment on column public.ghost_index_snapshot.feed_overlap is
  'Listings observed on both sides — employer ATS and employer feed. The only '
  'population in which a ghost can be identified at all.';

create index if not exists idx_ghost_index_snapshot_read
  on public.ghost_index_snapshot (scope, period, ghost_rate desc nulls last);

alter table public.ghost_index_snapshot enable row level security;

drop policy if exists ghost_index_snapshot_read on public.ghost_index_snapshot;
create policy ghost_index_snapshot_read on public.ghost_index_snapshot
  for select to anon, authenticated using (true);

-- Writes are service-role only: the snapshot is computed, never user-supplied.
grant select on public.ghost_index_snapshot to anon, authenticated;
grant select, insert, update, delete on public.ghost_index_snapshot to service_role;

-- ── hook into the existing refresh orchestration ────────────────────────────
-- Additive: widen the task check rather than introduce a second scheduler.
--
-- The task set is copied from the LIVE constraint, not from
-- 20260813093000 — later migrations added `role_families` and
-- `company_directory`, and rebuilding the check from that older file would have
-- silently dropped both. Read the constraint before you replace it.

alter table public.snapshot_refresh_state
  drop constraint if exists snapshot_refresh_state_task_check;

alter table public.snapshot_refresh_state
  add constraint snapshot_refresh_state_task_check
  check (task in (
    'analytics', 'skill_demand', 'job_search',
    'role_families', 'company_directory',
    'ghost_index'
  ));

insert into public.snapshot_refresh_state (task, status, requested_by)
values ('ghost_index', 'pending', 'migration')
on conflict (task) do nothing;
