-- 20260710b_user_notifications.sql (Backlog #36, Slice 2)
--
-- In-app notification inbox. v1 kind = 'fresh_matches' — written by the
-- scrape-triggered sweep (Slice 1) AFTER a user's recompute produces genuinely
-- new matches (compute-then-notify, never on speculation — N4). The ping carries
-- the match (top job + count), so opening the bell is itself the reward (N1,
-- Kunal lens), not a "come check" nudge.
--
-- Debounce: one unread 'fresh_matches' row per user is merged in place within a
-- window (see NotificationsRepository.record_fresh_matches) so a burst of scrapes
-- is one digest, not a stream. Writes are service-role (the sweep); reads +
-- mark-read are the owner via token RLS.

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind         text NOT NULL,              -- 'fresh_matches'
    title        text NOT NULL,              -- headline, e.g. "3 fresh matches"
    body         text,                       -- the digest line (carries the top match)
    job_id       text,                       -- top match carried in the ping (nullable)
    match_count  smallint NOT NULL DEFAULT 1,
    read_at      timestamptz,                -- NULL = unread
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
    ON public.user_notifications (user_id, created_at DESC);
-- Fast unread lookups + the debounce merge (unread fresh_matches in a window).
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
    ON public.user_notifications (user_id, kind, created_at DESC)
    WHERE read_at IS NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own notifications read" ON public.user_notifications;
CREATE POLICY "own notifications read"
    ON public.user_notifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Owner can mark their own notifications read (the only field they mutate).
DROP POLICY IF EXISTS "own notifications update" ON public.user_notifications;
CREATE POLICY "own notifications update"
    ON public.user_notifications
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
