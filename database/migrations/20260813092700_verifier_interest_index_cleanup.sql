-- The interest read model is 1.7k rows and claims combine its three signals
-- with OR/CASE. Live plans use the PK join, never these individual partial
-- indexes; retaining them would add three writes to every interest refresh.

DROP INDEX IF EXISTS public.idx_job_verification_interest_shown;
DROP INDEX IF EXISTS public.idx_job_verification_interest_application;
DROP INDEX IF EXISTS public.idx_job_verification_interest_matched;
