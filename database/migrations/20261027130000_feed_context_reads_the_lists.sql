-- The feed context reads the direction lists, never their singular copies
-- (CONTEXT → Targeting Brief). `target_location` / `target_location_country`
-- were a fallback for an empty list that fired for no row on 2026-10-27, and
-- `eligibility_profile.target_role_title` duplicated target_role_titles[0].
-- One of five stored copies approved to be dropped (BACKLOG, Shivam 2026-10-27).
--
-- Revert: restore the two singular `case` branches and the 'target_role_title'
-- key (the previous body is in 20260907_rehearsal_is_user_level.sql's lineage).

CREATE OR REPLACE FUNCTION public.current_user_feed_context()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
            select to_jsonb(coalesce(p.target_locations, '{}'::text[]))
            from public.user_profiles p where p.id = auth.uid()
        ), '[]'::jsonb),
        'target_location_countries', coalesce((
            select to_jsonb(coalesce(p.target_location_countries, '{}'::text[]))
            from public.user_profiles p where p.id = auth.uid()
        ), '[]'::jsonb),
        'eligibility_profile', coalesce((
            select jsonb_build_object(
                'target_role_titles', p.target_role_titles,
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
$function$
;
