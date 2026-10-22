-- The Distribution Tracker records launch videos (LAUNCH_VIDEOS.md) beside
-- newsletter issues, so they share one pipeline. Additive: widens the kind
-- check by one value. Reverse by restoring the eight-value list once no row
-- carries 'launch_video'.

alter table public.growth_content_assets
    drop constraint if exists growth_content_assets_kind_check;

alter table public.growth_content_assets
    add constraint growth_content_assets_kind_check
    check (kind in (
        'newsletter', 'article', 'guide', 'tool', 'company_page',
        'career_page', 'data_story', 'community_response', 'launch_video'
    ));

notify pgrst, 'reload schema';
