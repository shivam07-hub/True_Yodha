-- Drop the retired ₹199/month engagement's tables (#56 M4, ARCHITECTURE_PAYMENTS.md §4).
--
-- ENG2 folded the Personalised Engagement into the Apply Pack; its code was
-- deleted in #56 S5 (43f76951). Shivam said yes to this drop on 2026-11-24.
-- Checked immediately before: job_switch_plans 0 rows, job_switch_plan_reviews
-- 0 rows (0 ever, per the 2026-09-30 audit); no view, function or other table
-- references either, and no app code names them.
--
-- Destructive, but nothing is lost: both tables are empty. Reverse: re-run
-- the migrations that created them (search database/migrations for
-- job_switch_plans).

begin;

drop table if exists public.job_switch_plan_reviews;
drop table if exists public.job_switch_plans;

commit;

notify pgrst, 'reload schema';
