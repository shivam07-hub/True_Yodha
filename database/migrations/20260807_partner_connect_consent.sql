-- 20260807_partner_connect_consent.sql
-- Replace the emailed verification round-trip with an in-app consent screen.
--
-- Before: a partner user whose email already had a Myro account got NO sign-in
-- url; we emailed the owner and they came back later. Safe, but it bounced the
-- user out of the flow into their inbox — and a user who leaves the flow does
-- not come back (Shivam, 2026-08-07).
--
-- After: every call returns a url. When the account pre-exists, the url is a
-- Myro-hosted consent screen — "Finlatics wants to connect your Myro account" —
-- where the OWNER proves it is theirs by being signed in (one click) or signing
-- in there (Google, instant). The email link survives only as a fallback the
-- user can ask for.
--
-- The security property is unchanged and non-negotiable: the partner's word is
-- never enough to reach a pre-existing account. What changed is WHERE the owner
-- proves it — in the flow instead of in their inbox.
--
-- `connect_token` identifies which seat a consent screen is for. It is not a
-- credential: holding it grants nothing without authenticating as the owner. It
-- is still stored hashed and short-lived, because it also names an email
-- address and there is no reason to leak that from a table dump.
--
-- Zero rows exist in these tables today (no partner is provisioned yet), so the
-- state rename is a pure vocabulary fix with nothing to migrate.

alter table public.partner_users
    drop constraint if exists partner_users_link_state_check;

update public.partner_users
   set link_state = 'pending_connect'
 where link_state = 'pending_verification';

alter table public.partner_users
    add constraint partner_users_link_state_check
    check (link_state in ('linked', 'pending_connect'));

alter table public.partner_users
    add column if not exists connect_token_hash text,
    add column if not exists connect_token_expires_at timestamptz;

create index if not exists partner_users_connect_token
    on public.partner_users (connect_token_hash)
    where connect_token_hash is not null;

notify pgrst, 'reload schema';
