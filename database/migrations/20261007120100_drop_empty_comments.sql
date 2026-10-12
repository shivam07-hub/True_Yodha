-- Comments are gone (4709e630, Shivam 2026-10-02): 0 rows were ever written,
-- and their router, repository and UI were deleted. Dropping the empty tables
-- (Shivam, 2026-10-07). comment_flags references comments, so it goes first.

drop table if exists public.comment_flags;
drop table if exists public.comments;

notify pgrst, 'reload schema';
