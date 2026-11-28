-- An order records the door it was bought through.
--
-- ARCHITECTURE_ONE_PREP.md P3 puts the ₹199 and ₹599 offers inside the
-- Preparation room, beside the one on the CV page (ENG6). `billing_payments`
-- recorded the job a pack was bought for (`job_id`) but not where the person
-- pressed buy, so "did the room sell anything" had no answer.
--
--   cv        the gap door, under the Myro Score on the CV page (PackOffer)
--   room      a Preparation room, job or target role (PackOffer)
--   stakes    the line beside a job's CV (HumanCheckLine)
--   linkedin  the LinkedIn check card
--   fuel      out of coins (XPGateModal)
--   pack      the /apply-pack page
--   filing    the /filing (₹599) page
--   myrology  the Myrology checkout
--
-- Null = an order from before this column, or a client that sent none.
-- Additive. Reverse: alter table public.billing_payments drop column surface;

begin;

alter table public.billing_payments
  add column if not exists surface text;

alter table public.billing_payments drop constraint if exists billing_payments_surface_check;
alter table public.billing_payments add constraint billing_payments_surface_check
  check (surface in ('cv', 'room', 'stakes', 'linkedin', 'fuel', 'pack', 'filing', 'myrology'));

comment on column public.billing_payments.surface is
  'The door the order was bought through (ARCHITECTURE_ONE_PREP.md P3). Null before 2026-11-28.';

commit;

notify pgrst, 'reload schema';
