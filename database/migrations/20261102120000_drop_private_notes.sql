-- 2026-11-02 — drop private_notes (Shivam, 2026-11-02).
--
-- Nothing has read or written this table since its code was removed in 4709e630.
-- It held one row, which no screen could show. Destructive and not reversible.

DROP TABLE IF EXISTS public.private_notes;
