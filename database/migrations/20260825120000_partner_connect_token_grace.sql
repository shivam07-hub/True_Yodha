-- A concurrent SSO call must not kill the consent screen already on its way.
--
-- MEASURED on prod. `partner_users` holds 159 seats `linked` (newest today, so
-- SSO itself works) and **24 `pending_connect`, all 24 with an expired token**,
-- newest 2026-08-24 18:07. Those are 24 Finlatics users who were handed a
-- consent screen and never got through it.
--
-- The Railway trace for one of them:
--
--   18:53:18.517  POST /partner/v1/sso/session   200  1516ms
--   18:53:18.706  POST /partner/v1/sso/session   200  3416ms
--   18:53:19.580  POST /partner/v1/sso/session   200   876ms
--   18:53:22.791  GET  /partner-connect/context  404   213ms
--
-- Three SSO calls for one seat inside 1.1s, then a context lookup four seconds
-- later that 404s. `start_session` mints a fresh token on every call and
-- `upsert_link` overwrites `connect_token_hash` — deliberately: "a re-issued
-- token replaces its predecessor rather than leaving two valid ways into the
-- same screen." So two of those three tokens were dead before the user's
-- browser loaded anything, and the browser was holding one of them.
--
-- 404 -> the partner retries the SSO call -> a fresh token kills the previous
-- one again -> 404. That loop is why POST /partner/v1/sso/session is 170 of 613
-- saturation-alert lines (27.7%) and fires in runs of 4-6 per 120s window for a
-- partner with a handful of users (ARCHITECTURE_READ_PATH.md S16 P0).
--
-- The guard being removed was protecting against nothing. Both tokens name the
-- SAME seat and the SAME email, and holding one grants nothing on its own —
-- `approve_connect` still requires authenticating as that address. Two live
-- tokens for one seat is not a widening; one dead token for a live screen is a
-- broken funnel.
--
-- The carried-forward token keeps its ORIGINAL expiry. Nothing outlives the
-- 30-minute TTL, and re-calling SSO cannot extend a token's life.

alter table public.partner_users
  add column if not exists prev_connect_token_hash text,
  add column if not exists prev_connect_token_expires_at timestamptz;

comment on column public.partner_users.prev_connect_token_hash is
  'The token this seat''s current token replaced, still accepted until its own '
  'original expiry. Lets a consent screen already in flight survive a '
  'concurrent SSO call. See migration 20260825120000.';

create index if not exists idx_partner_users_prev_connect_token
  on public.partner_users (prev_connect_token_hash)
  where prev_connect_token_hash is not null;
