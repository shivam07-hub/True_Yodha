-- Backlog #33 — ₹99 Personalised Job-Switch Plan (B-grill 2026-06-27).
-- One LIVING plan per user (B4) + up to TWO async human reviews within a
-- 120-day window (B5/B6). Additive; reuses the existing billing_payments +
-- Razorpay fulfilment path (a new "job_switch_plan" entitlement product flips
-- this plan on, exactly-once via the same created->verified CAS).
--
-- RLS: SELECT-own only; all writes go through the service-role admin client
-- (mirrors myrology_bookings). Apply on the shared Supabase, then
-- NOTIFY pgrst,'reload schema'.

BEGIN;

CREATE TABLE IF NOT EXISTS job_switch_plans (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- One plan per user (B4): the living plan re-targets free, never re-purchased.
    user_id           uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    target_role       text,
    -- Snapshot of the gap that justified the purchase, for the human reviewer to
    -- anchor on. The LIVE plan content is recomputed from the skill engine; this
    -- is the "where you started" reference, not the source of truth.
    gap_snapshot      jsonb NOT NULL DEFAULT '[]'::jsonb,
    status            text  NOT NULL DEFAULT 'active',   -- 'active' (never expires)
    reviews_used      int   NOT NULL DEFAULT 0,          -- cap 2 (B5)
    window_expires_at timestamptz NOT NULL,              -- purchase + 120 days (B5)
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT job_switch_plans_reviews_used_chk CHECK (reviews_used BETWEEN 0 AND 2)
);

CREATE TABLE IF NOT EXISTS job_switch_plan_reviews (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id      uuid NOT NULL REFERENCES job_switch_plans(id) ON DELETE CASCADE,
    review_no    int  NOT NULL,                          -- 1 (auto) | 2 (on-demand)
    status       text NOT NULL DEFAULT 'pending',        -- pending -> in_progress -> delivered
    review_text  text,
    sla_due_at   timestamptz NOT NULL,                   -- requested + 5 working days
    requested_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz,
    CONSTRAINT job_switch_plan_reviews_no_chk CHECK (review_no IN (1, 2)),
    CONSTRAINT job_switch_plan_reviews_unique UNIQUE (plan_id, review_no)
);

CREATE INDEX IF NOT EXISTS idx_jsp_reviews_plan ON job_switch_plan_reviews (plan_id);
-- Founder/HITL queue: open reviews oldest-first.
CREATE INDEX IF NOT EXISTS idx_jsp_reviews_open
    ON job_switch_plan_reviews (status, sla_due_at)
    WHERE status <> 'delivered';

ALTER TABLE job_switch_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_switch_plan_reviews   ENABLE ROW LEVEL SECURITY;

-- SELECT-own. No INSERT/UPDATE/DELETE policy → only the service-role admin
-- client (which bypasses RLS) can write, exactly like myrology_bookings.
DROP POLICY IF EXISTS jsp_select_own ON job_switch_plans;
CREATE POLICY jsp_select_own ON job_switch_plans
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS jsp_reviews_select_own ON job_switch_plan_reviews;
CREATE POLICY jsp_reviews_select_own ON job_switch_plan_reviews
    FOR SELECT USING (
        plan_id IN (SELECT id FROM job_switch_plans WHERE user_id = auth.uid())
    );

COMMIT;
