-- Wave 2 slice 2: metering for the recruiter live-role feed.
--
-- The unit follows MTR1's logic rather than inventing a second one. A seat is
-- billable once a month however often it signs in; a ROLE is billable once a
-- month however often it is fetched. A recruiter polling hourly for freshness —
-- which is the entire point of a live feed — must not cost more than one who
-- polls daily. Charging per request would price the plumbing and punish the
-- behaviour the product is for.
--
-- So the meter records one event per (partner, role, month) and the database
-- enforces that, not the application. A partial unique index plus ON CONFLICT
-- DO NOTHING makes the write idempotent in one statement: no read-then-write,
-- no race, and bounded growth — at most one row per role per partner per month.
--
-- Scoped to `roles.delivered` on purpose. `sso.session` keeps every event,
-- because how often a seat signs in is worth knowing even though the bill only
-- counts distinct seats. Deduplicating that would throw away the detail.

create unique index if not exists partner_usage_events_roles_once_per_month
  on public.partner_usage_events (partner_id, subject_id, period_month)
  where metric = 'roles.delivered' and subject_id is not null;

comment on index public.partner_usage_events_roles_once_per_month is
  'One row per role per partner per billing month. Makes the feed meter '
  'idempotent under polling: re-fetching a role the partner already received '
  'this month is free, which is the honest behaviour for a freshness feed.';
