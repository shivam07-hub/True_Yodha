-- The usage meter.
--
-- The partner API has carried real traffic since 2026-08-10 — 281 seats, ~9 new
-- a day, an SSO session as recently as this morning — and none of it has ever
-- been counted. `partner_api_keys.last_used_at` and `partner_users.last_sso_at`
-- are both OVERWRITTEN on each use, so there is no history to reconstruct: the
-- meter necessarily starts at zero today, whatever it counts.
--
-- Four decisions, taken 2026-09-05, that this schema encodes:
--
-- 1. **The billable unit is a monthly active seat** — a seat that signed in
--    during the month, not one that sits on the roster. So the fact recorded is
--    a SESSION, and "active seats" is `count(distinct subject_id)` over a
--    period. A count column could not answer it; the events can.
--
-- 2. **Record, never block.** Nothing here refuses a request, and there is no
--    plan or quota column on purpose. This partner's SSO is the login path for
--    281 real students; the first thing a new meter does must not be an outage.
--
-- 3. **Meter silently, price later.** Which is why both SSO modes are recorded
--    with `mode` in `detail`: `direct` hands the user a login, `connect` hands
--    them a consent screen. A stricter definition ("active means direct") stays
--    available later without re-instrumenting.
--
-- 4. **`partners` is the account.** No new tenant table. It already carries
--    slug/name/status, and a future dataset customer is a row in it — one
--    account table, one meter, whatever the product.
--
-- Deliberately NOT metered: per-request volume. The key ceiling is 600/min, so
-- a row per request is unbounded by design, and nothing bills on it. This table
-- accepts that metric later with no schema change if it ever earns its keep.

create table if not exists public.partner_usage_events (
  id          bigint generated always as identity primary key,
  partner_id  uuid not null references public.partners(id) on delete cascade,

  -- Dotted namespace so one table serves every product: `sso.session` today,
  -- a dataset metric later, without a second meter existing.
  metric      text not null check (metric ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),

  -- What the event is ABOUT. A seat id for seat metrics; null for
  -- account-level ones. Text rather than a FK: the meter must survive the
  -- subject being deleted — a bill is not amended by a roster edit.
  subject_id  text,

  occurred_at timestamptz not null default now(),

  -- The billing period, derived rather than passed in. A caller that computes
  -- its own month gets it wrong at a boundary exactly once, in production, and
  -- nobody notices until an invoice is queried.
  --
  -- Stored as the month's first day in IST, not a 'YYYY-MM' string.
  --
  -- Why IST: a login at 4am IST on 1 September is 22:30 UTC on 31 August, so a
  -- UTC period would bill an September session to August. Verified against that
  -- exact boundary before this shipped. Myro is India-first and so is this
  -- partner. The offset is a fixed +05:30 interval rather than
  -- `AT TIME ZONE 'Asia/Kolkata'` because a named zone is only STABLE — its
  -- rules can change — while an interval is IMMUTABLE, and India has no DST, so
  -- the fixed offset is exact rather than a convenient approximation.
  --
  -- Why a date: EVERY variant of `to_char` is STABLE (it reads DateStyle and
  -- lc_time), so Postgres refuses it in a generated column outright. `date_trunc`
  -- on a plain timestamp is immutable. A date also sorts, ranges and indexes
  -- properly, which a 'YYYY-MM' string only appears to do; formatting is a
  -- presentation concern and lives in the read.
  period_month date generated always as
              (date_trunc('month', occurred_at at time zone interval '05:30')::date) stored,

  detail      jsonb not null default '{}'::jsonb
);

comment on table public.partner_usage_events is
  'Append-only usage meter for B2B accounts. One row per metered event. Active '
  'seats for a period = count(distinct subject_id) where metric = ''sso.session''. '
  'No plan, no quota, no enforcement: this records, it never refuses.';

comment on column public.partner_usage_events.subject_id is
  'Text, not a foreign key. Deleting a seat must not erase the months it was '
  'billable for.';

comment on column public.partner_usage_events.period_month is
  'First day of the billing month in IST. Generated from occurred_at, never '
  'supplied by a caller: a caller that computes its own month gets the boundary '
  'wrong exactly once, in production, and nobody notices until an invoice is '
  'queried.';

create index if not exists partner_usage_events_read
  on public.partner_usage_events (partner_id, metric, period_month);

create index if not exists partner_usage_events_period
  on public.partner_usage_events (period_month);

-- Service-role only, no policies — the same posture as every other partner
-- table. No end-user token reads usage.
alter table public.partner_usage_events enable row level security;
revoke all on public.partner_usage_events from public, anon, authenticated;
grant select, insert on public.partner_usage_events to service_role;
grant usage, select on sequence public.partner_usage_events_id_seq to service_role;


-- ── the read ────────────────────────────────────────────────────────────────

create or replace function public.partner_usage_summary(
  p_partner_id uuid default null,
  p_period text default null
)
returns table (
  partner_id   uuid,
  partner_slug text,
  period       text,
  metric       text,
  events       bigint,
  active_seats bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.partner_id,
    p.slug,
    to_char(e.period_month, 'YYYY-MM'),
    e.metric,
    count(*)                        as events,
    count(distinct e.subject_id)    as active_seats
  from partner_usage_events e
  join partners p on p.id = e.partner_id
  where (p_partner_id is null or e.partner_id = p_partner_id)
    and (p_period is null or e.period_month = to_date(p_period, 'YYYY-MM'))
  group by e.partner_id, p.slug, e.period_month, e.metric
  order by e.period_month desc, p.slug, e.metric;
$$;

comment on function public.partner_usage_summary(uuid, text) is
  'Usage per account, period and metric. `active_seats` is the billable unit '
  'for seat metrics: distinct seats seen in the period, never the roster size.';

revoke all on function public.partner_usage_summary(uuid, text)
  from public, anon, authenticated;
grant execute on function public.partner_usage_summary(uuid, text) to service_role;
