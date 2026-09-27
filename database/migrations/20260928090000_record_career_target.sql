-- One writer for a direction change, in one transaction.
--
-- `career_target.record_from_profile` made five serial round trips on the
-- request the user was waiting on (read current, supersede, L1 lookup,
-- baseline lookup, insert), and ran them on whichever client the caller held.
-- From a user token the supersede failed: `authenticated` may only SELECT this
-- table, so PUT /users/me/profile and POST /preflight/run returned 500 after
-- the profile had already changed (Notice
-- unhandled_500:APIError:career_target.py:record_from_profile, 18 since 09-11).
--
-- This function is the whole write. The caller names the direction; the
-- function supersedes and inserts atomically, looks up the L1 area and the
-- latest baseline itself, and is a no-op when the current row already says
-- the same thing. A missing or drifted current row is replaced, so any
-- direction write brings the snapshot forward.
--
-- Additive. Reverse: drop function public.record_career_target(uuid, text, text, text, text[]);

begin;

create or replace function public.record_career_target(
    p_user_id uuid,
    p_role_title text,
    p_family text,
    p_seniority text,
    p_locations text[]
)
returns void
language plpgsql
volatile
set search_path to 'public'
as $$
declare
    v_current public.career_target_snapshots%rowtype;
    v_locations text[] := coalesce(p_locations, '{}'::text[]);
    v_canonical boolean :=
        nullif(btrim(coalesce(p_role_title, '')), '') is not null
        and nullif(btrim(coalesce(p_family, '')), '') is not null
        and p_seniority is not null;
begin
    -- Two direction writes for one person can land together (a double submit,
    -- a forward pass on the same visit). One at a time, or the second insert
    -- trips career_target_snapshots_current.
    perform pg_advisory_xact_lock(hashtextextended('career_target:' || p_user_id::text, 0));

    select * into v_current
    from public.career_target_snapshots
    where user_id = p_user_id and superseded_at is null;

    if v_canonical and found
       and v_current.role_title = p_role_title
       and v_current.l2_role_family = p_family
       and v_current.seniority = p_seniority
       and v_current.locations = v_locations then
        return;
    end if;

    update public.career_target_snapshots
    set superseded_at = now()
    where user_id = p_user_id and superseded_at is null;

    -- A cleared or incomplete direction supersedes without inserting, so the
    -- user is gated until they finish the standardized flow.
    if not v_canonical then
        return;
    end if;

    insert into public.career_target_snapshots (
        user_id, role_title, l1_career_area, l2_role_family,
        seniority, locations, cv_baseline_id
    )
    values (
        p_user_id,
        p_role_title,
        public.l1_career_area_for_family(p_family),
        p_family,
        p_seniority,
        v_locations,
        (
            select v.id
            from public.cv_versions v
            where v.user_id = p_user_id and v.kind = 'baseline_upload'
            order by v.created_at desc
            limit 1
        )
    );
end;
$$;

comment on function public.record_career_target(uuid, text, text, text, text[]) is
  'The only write to career_target_snapshots. Atomic supersede + insert; '
  'no-op when the current row already names this direction. Service role only.';

revoke all on function public.record_career_target(uuid, text, text, text, text[])
    from public, anon, authenticated;
grant execute on function public.record_career_target(uuid, text, text, text, text[])
    to service_role;

commit;
