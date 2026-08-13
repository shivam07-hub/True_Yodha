-- One J0 feed request previously paid seven independent Data API round trips
-- before it could ask for jobs. They are all small projections of the current
-- user's own state, so expose them as one RLS-authorized read model.
create or replace function public.current_user_feed_context()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select jsonb_build_object(
        'skill_keys', coalesce((
            select jsonb_agg(distinct keys.value)
            from public.user_skills us
            join public.skills s on s.id = us.skill_id
            cross join lateral (
                values
                    (nullif(lower(btrim(s.taxonomy_key)), '')),
                    (nullif(lower(btrim(s.display_name)), ''))
            ) as keys(value)
            where us.user_id = auth.uid() and keys.value is not null
        ), '[]'::jsonb),
        'target_roles', coalesce((
            select to_jsonb(p.target_roles)
            from public.user_profiles p where p.id = auth.uid()
        ), '[]'::jsonb),
        'target_locations', coalesce((
            select case
                when coalesce(array_length(p.target_locations, 1), 0) > 0
                    then to_jsonb(p.target_locations)
                when nullif(btrim(p.target_location), '') is not null
                    then jsonb_build_array(p.target_location)
                else '[]'::jsonb
            end
            from public.user_profiles p where p.id = auth.uid()
        ), '[]'::jsonb),
        'target_location_countries', coalesce((
            select case
                when coalesce(array_length(p.target_location_countries, 1), 0) > 0
                    then to_jsonb(p.target_location_countries)
                when nullif(btrim(p.target_location_country), '') is not null
                    then jsonb_build_array(p.target_location_country)
                else '[]'::jsonb
            end
            from public.user_profiles p where p.id = auth.uid()
        ), '[]'::jsonb),
        'eligibility_profile', coalesce((
            select jsonb_build_object(
                'target_role_titles', p.target_role_titles,
                'target_role_title', p.target_role_title,
                'target_roles', p.target_roles,
                'target_seniority', p.target_seniority,
                'target_career_band', p.target_career_band,
                'explored_career_bands', p.explored_career_bands
            )
            from public.user_profiles p where p.id = auth.uid()
        ), '{}'::jsonb),
        'dismissed_job_ids', coalesce((
            select jsonb_agg(d.job_id)
            from public.user_dismissed_job_cards d
            where d.user_id = auth.uid()
        ), '[]'::jsonb),
        'saved_job_ids', coalesce((
            select jsonb_agg(a.job_id)
            from public.job_applications a
            where a.user_id = auth.uid()
        ), '[]'::jsonb)
    );
$$;

revoke all on function public.current_user_feed_context() from public, anon;
grant execute on function public.current_user_feed_context() to authenticated, service_role;

comment on function public.current_user_feed_context() is
    'J0 market feed prelude: current users own skill, target, location and exclusion state in one RLS read';

notify pgrst, 'reload schema';
