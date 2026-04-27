-- Enable RLS on public read-only tables so token-scoped clients can query them.
-- The policies already exist in schema.sql but the ENABLE statement was missing,
-- which caused authenticated reads to return 0 rows (no grant to the authenticated role).

ALTER TABLE jobs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

-- Re-create policies idempotently in case they weren't applied in production.
DROP POLICY IF EXISTS "jobs public read"   ON jobs;
CREATE POLICY "jobs public read"   ON jobs   FOR SELECT USING (true);

DROP POLICY IF EXISTS "skills public read" ON skills;
CREATE POLICY "skills public read" ON skills FOR SELECT USING (true);
