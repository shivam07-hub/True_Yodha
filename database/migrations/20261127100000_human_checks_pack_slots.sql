-- The ₹599 pack's checks (#56 §10.3, M5; ENG5).
--
-- One ₹199 payment opens one check, keyed by `billing_payment_id` (unique).
-- One ₹599 payment opens three: that same first check, plus two more keyed by
-- (`pack_payment_id`, `pack_slot`): slot 2 a check held for the LinkedIn
-- rewrite, slot 3 the `search` call — the role, the career pages Myro files
-- on, and how the person uses AI in the search. A `search` check is delivered
-- with a note alone.
--
-- Why a second column instead of widening the first key: dev and prod share
-- one database (INFRA.md) and `main` upserts on `billing_payment_id`. Leaving
-- that unique key exactly as it is keeps every deployed backend working while
-- this ships; the first check of any pack is still written the old way.
--
-- Additive: existing rows keep `pack_payment_id` and `pack_slot` null. Reverse:
-- delete rows with pack_payment_id set, drop the four new constraints, restore
-- the two widened checks without 'search', drop both columns.

begin;

alter table public.human_checks
    add column if not exists pack_payment_id uuid null references public.billing_payments (id),
    add column if not exists pack_slot smallint null;

alter table public.human_checks drop constraint if exists human_checks_pack_slot_range;
alter table public.human_checks
    add constraint human_checks_pack_slot_range check (pack_slot is null or pack_slot in (2, 3));

-- A pack check has both its payment and its slot, or neither.
alter table public.human_checks drop constraint if exists human_checks_pack_slot_with_payment;
alter table public.human_checks
    add constraint human_checks_pack_slot_with_payment check ((pack_payment_id is null) = (pack_slot is null));

-- A check is opened by a payment one way, not both.
alter table public.human_checks drop constraint if exists human_checks_one_payment_key;
alter table public.human_checks
    add constraint human_checks_one_payment_key check (billing_payment_id is null or pack_payment_id is null);

alter table public.human_checks drop constraint if exists human_checks_pack_slot_key;
alter table public.human_checks
    add constraint human_checks_pack_slot_key unique (pack_payment_id, pack_slot);

alter table public.human_checks drop constraint if exists human_checks_paid_or_linkedin;
alter table public.human_checks
    add constraint human_checks_paid_or_linkedin check (
        billing_payment_id is not null or pack_payment_id is not null or kind = 'linkedin'
    );

alter table public.human_checks drop constraint if exists human_checks_kind_check;
alter table public.human_checks
    add constraint human_checks_kind_check check (kind in ('cv_job', 'linkedin', 'search'));

alter table public.human_checks drop constraint if exists human_checks_delivered_is_signed;
alter table public.human_checks
    add constraint human_checks_delivered_is_signed check (
        status <> 'delivered'
        or (
            delivered_at is not null and note is not null and reviewer_name is not null
            and ((kind = 'cv_job' and reviewed_cv_version_id is not null)
                 or (kind = 'linkedin' and blocks is not null)
                 or kind = 'search')
        )
    );

commit;

notify pgrst, 'reload schema';
