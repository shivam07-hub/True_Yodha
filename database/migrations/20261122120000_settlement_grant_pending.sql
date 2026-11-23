-- Settlement: a payment arrived; grant exactly once (#56 S1, M1 + M2).
--
-- ARCHITECTURE_PAYMENTS.md §2: `verified` was flipped BEFORE the grant ran, so
-- a grant that failed was never retried — the retry read `already_verified`.
-- `grant_pending` is set in the same update that claims the row and cleared
-- only after the grant finishes, so any later arrival can finish it.
--
-- billing_payments
--   grant_pending — the claim happened, the grant has not finished.
--   job_id        — the job a pack was bought for (the stakes door, S2).
--   failed_at     — Razorpay said payment.failed; a later capture still settles.
--   status        — gains 'failed', so abandoned and failed stop looking alike.
-- ai_workflow_audits
--   billing_payment_id — one audit per paid row; a conflict means already granted.
--
-- Additive. Historical rows default to not-pending; no data rewrite.
-- Reverse: drop the four columns, the index and the unique constraint, and
-- re-add the status CHECK as ('created','verified') after no row is 'failed'.

begin;

alter table public.billing_payments
    add column if not exists grant_pending boolean not null default false,
    add column if not exists job_id text null,
    add column if not exists failed_at timestamptz null;

alter table public.billing_payments drop constraint if exists billing_payments_status_check;
alter table public.billing_payments add constraint billing_payments_status_check
    check (status in ('created', 'verified', 'failed'));

-- The reviewer desk reads stuck grants (pending for over an hour).
create index if not exists idx_billing_payments_grant_pending
    on public.billing_payments (verified_at)
    where grant_pending;

alter table public.ai_workflow_audits
    add column if not exists billing_payment_id uuid null
        references public.billing_payments (id);

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'ai_workflow_audits_billing_payment_id_key'
    ) then
        alter table public.ai_workflow_audits
            add constraint ai_workflow_audits_billing_payment_id_key unique (billing_payment_id);
    end if;
end $$;

commit;

notify pgrst, 'reload schema';
