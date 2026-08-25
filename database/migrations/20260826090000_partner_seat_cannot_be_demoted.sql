-- A second SSO call must not un-link a seat the first one just linked.
--
-- `0bdc8ef5` gave the consent TOKEN a grace window so a screen already in
-- flight survives a re-mint. It did not close the other half of the same race,
-- and the 24 stuck Finlatics seats are that other half.
--
-- MEASURED on prod, 2026-08-25, on all 24 of the seats sitting in
-- `pending_connect` with `user_id IS NULL`:
--
--   linked_at is set                                  24 / 24
--   linked_at within +-1.03s of the seat's created_at  24 / 24
--   last_sso_at is AFTER linked_at                    24 / 24
--   an auth.users row exists for that email           24 / 24
--   that auth user born within 60s of linked_at       24 / 24
--   a provisioned user_profiles row exists            24 / 24
--   the email maps to more than one auth user          0 / 24
--
-- 11 of the 24 have never signed in. Nobody was ever in front of a screen to
-- abandon. These seats were LINKED and then taken apart by our own second write.
--
-- The path, in `services/partner_sso.start_session`:
--
--   call 1  create_user_if_absent CREATES the account -> ensure_user_provisioned
--           -> upsert_link(link_state='linked', user_id=...). That is the only
--           branch that stamps linked_at at seat-creation time, and it skips
--           consent because the address was new: linking it "cannot take
--           anything over".
--   call 2  read its `existing` BEFORE call 1's write landed, so the
--           already-linked guard at the top of the function saw nothing. Its own
--           create_user_if_absent now returns NULL — the account exists, because
--           call 1 just made it — so it takes the "address predates this call"
--           branch and upserts link_state='pending_connect', user_id=NULL.
--           The good link is gone.
--
-- linked_at survived only because the payload never cleared it, which is the
-- only reason the fingerprint is still readable a fortnight later.
--
-- Read-then-write. Narrowing the window in Python would not close it, so the
-- invariant moves into the write itself: the consent branch is one statement
-- that REFUSES to demote a seat already linked at the same address, and tells
-- the caller it refused. The caller then returns the sign-in url it would have
-- returned had its read happened a moment later.
--
-- An email CHANGE still re-opens the gate — that is the takeover check and it
-- is untouched. A seat carrying link_state='linked' with a NULL user_id is
-- broken state, and is still claimable so a fresh SSO call can repair it.
--
-- Reversible: drop the function. The old unconditional upsert is in git.

create or replace function public.partner_claim_connect_seat(
  p_partner_id uuid,
  p_external_id text,
  p_email text,
  p_connect_token_hash text,
  p_connect_token_expires_at timestamptz,
  p_prev_connect_token_hash text,
  p_prev_connect_token_expires_at timestamptz
)
returns table (seat jsonb, claimed boolean)
language plpgsql
as $$
declare
  v_row public.partner_users;
begin
  insert into public.partner_users as pu (
    partner_id, external_id, email, user_id, link_state,
    connect_token_hash, connect_token_expires_at,
    prev_connect_token_hash, prev_connect_token_expires_at
  )
  values (
    p_partner_id, p_external_id, lower(btrim(p_email)), null, 'pending_connect',
    p_connect_token_hash, p_connect_token_expires_at,
    p_prev_connect_token_hash, p_prev_connect_token_expires_at
  )
  on conflict (partner_id, external_id) do update
    set email                         = excluded.email,
        user_id                       = null,
        link_state                    = 'pending_connect',
        connect_token_hash            = excluded.connect_token_hash,
        connect_token_expires_at      = excluded.connect_token_expires_at,
        prev_connect_token_hash       = excluded.prev_connect_token_hash,
        prev_connect_token_expires_at = excluded.prev_connect_token_expires_at
    -- The whole fix. False on exactly one shape: this seat is already linked,
    -- to a real user, at this same address. That is a sibling call having won
    -- the race, not a seat waiting for consent.
    where pu.link_state is distinct from 'linked'
       or pu.user_id is null
       or lower(pu.email) is distinct from excluded.email
  returning pu.* into v_row;

  if found then
    return query select to_jsonb(v_row), true;
    return;
  end if;

  select * into v_row
    from public.partner_users
   where partner_id = p_partner_id and external_id = p_external_id;

  -- The conflict fired, so the row was there a statement ago. If it is not
  -- there now the seat was deleted mid-call, and returning a "linked" verdict
  -- for a row that no longer exists would hand the partner a url to nothing.
  if v_row.id is null then
    raise exception 'partner_claim_connect_seat: seat %/% vanished mid-call',
      p_partner_id, p_external_id;
  end if;

  return query select to_jsonb(v_row), false;
end;
$$;

comment on function public.partner_claim_connect_seat is
  'Write a consent-screen seat, unless it is already linked to a real user at '
  'the same address. Returns (seat, claimed); claimed=false means a concurrent '
  'SSO call linked it first and the caller owes a sign-in url, not a consent '
  'screen. See migration 20260826090000.';

-- Every caller is service_role: PartnersRepository takes the admin client
-- explicitly. Reachable by `anon`, this is a denial primitive — it nulls
-- user_id and rewrites the email on any seat whose partner_id and external_id
-- a caller can name. PUBLIC carries a default EXECUTE grant on new functions
-- and anon/authenticated inherit through it, so revoke that too.
revoke execute on function public.partner_claim_connect_seat(
  uuid, text, text, text, timestamptz, text, timestamptz) from public;
revoke execute on function public.partner_claim_connect_seat(
  uuid, text, text, text, timestamptz, text, timestamptz) from anon, authenticated;
grant execute on function public.partner_claim_connect_seat(
  uuid, text, text, text, timestamptz, text, timestamptz) to service_role;
