-- #59 S3 — the golden-list digest's one-click unsubscribe.
--
-- Empty means the person still gets the digest (if they are on the golden list).
-- Written only by POST /email/unsubscribe, from a token in the email itself.
-- Additive and reversible: `alter table public.user_profiles drop column digest_unsubscribed_at;`
-- Each send is a `user_notifications` row (kind 'golden_digest', source_id
-- 'golden_digest:YYYY-MM-DD'); the existing unique (user_id, kind, source_id)
-- index is what refuses a second send the same day — no new table, no new index.

alter table public.user_profiles
  add column if not exists digest_unsubscribed_at timestamptz;

comment on column public.user_profiles.digest_unsubscribed_at is
  'When this person unsubscribed from the golden-list digest (#59). Null = subscribed.';

notify pgrst, 'reload schema';
