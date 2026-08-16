-- Pre-flight: remember which run the order last started.
--
-- Why. `POST /preflight/run` charges (JobRefresh.start → _xp_charge.charge) and
-- then dispatches. Nothing stopped a second call from charging again: the run
-- takes long enough that a user whose first click appeared to do nothing clicks
-- again, and each click that reaches the server is another 100 coins. That is
-- exactly what happened in the 2026-08-16 authed session — the client timed out
-- at 15s while the server was still writing, so the user pressed Run repeatedly.
--
-- The client's in-flight guard is necessary and not sufficient: it does not
-- survive two tabs, a reload, or a retry after a timeout. So the server keeps
-- the ticket it last started and, inside a short window, hands that same ticket
-- back instead of charging for a second one.
--
-- Additive and reversible. Manual-apply then NOTIFY pgrst.

ALTER TABLE public.preflight_orders
    ADD COLUMN IF NOT EXISTS last_ticket_id text;

COMMENT ON COLUMN public.preflight_orders.last_ticket_id IS
    'Ticket id of the most recent dispatched run. With last_run_at it makes POST /preflight/run idempotent inside a short window, so a double click cannot charge twice.';

NOTIFY pgrst, 'reload schema';
