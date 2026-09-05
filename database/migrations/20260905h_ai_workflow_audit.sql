-- ₹999 AI Workflow Audit — a reviewed deliverable, not a course.
--
-- The buyer describes an AI workflow they actually run; a human returns a
-- written audit of it. This is the thesis's own product line — human-in-the-loop
-- AI ops — sold rather than only practised (POSITIONING.md, bet 4).
--
-- It deliberately paywalls NOTHING that is free today. Practice, quizzes and
-- certificates stay free and ungated; what is sold is a human reading your
-- workflow and writing you an answer.
--
-- Lifecycle vocabulary is copied from `job_switch_plan_reviews` on purpose —
-- pending/in_progress/delivered, an SLA in working days, an LLM draft the
-- reviewer works from. The ₹99 plan is the same shape and is live, so a later
-- merge into one reviewed-deliverable primitive is a rename, not a redesign.
-- Not merged now: that refactor would touch a live paid product for no gain
-- today.
--
-- Two structural guarantees, in constraints rather than in a docstring:
--
--   1. **A delivered audit has a human's name on it.** `audit_text` cannot be
--      set without `reviewed_by` and `signed_off_at`. Selling an unread LLM
--      draft as a reviewed audit is precisely the "fiction is cheap" product
--      this company exists to argue against, and a comment would not stop it.
--
--   2. **The draft the model wrote is not in the buyer's table.** It lives in a
--      reviewer-only table with no user policy, so a user reading their own row
--      through PostgREST cannot reach it. Column-level discipline in an API
--      handler is a convention; a separate table is a boundary.

create table if not exists public.ai_workflow_audits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- awaiting_submission: paid, we are waiting for them to describe the workflow.
  -- submitted:           in the queue, SLA clock running.
  -- in_progress:         a reviewer has picked it up.
  -- delivered:           terminal.
  status       text not null default 'awaiting_submission'
               check (status in ('awaiting_submission', 'submitted', 'in_progress', 'delivered')),

  -- What the buyer told us they run. Shape is owned by the intake schema, not
  -- by the database: the questions will change and old audits must stay
  -- readable exactly as they were answered.
  intake       jsonb,

  audit_text   text,
  reviewed_by  text,
  signed_off_at timestamptz,

  purchased_at timestamptz not null default now(),
  submitted_at timestamptz,
  sla_due_at   timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Guarantee 1. A written audit carries a signature, or it does not exist.
  constraint ai_workflow_audits_signed_chk check (
    (audit_text is null and reviewed_by is null and signed_off_at is null)
    or (audit_text is not null and reviewed_by is not null and signed_off_at is not null)
  ),
  -- Delivered means delivered: the artifact exists and is signed.
  constraint ai_workflow_audits_delivered_chk check (
    status <> 'delivered' or (audit_text is not null and delivered_at is not null)
  ),
  -- The SLA clock starts at submission, never at purchase — we cannot be late
  -- for work the buyer has not handed us yet.
  constraint ai_workflow_audits_submitted_chk check (
    status = 'awaiting_submission'
    or (intake is not null and submitted_at is not null and sla_due_at is not null)
  )
);

comment on table public.ai_workflow_audits is
  '₹999 AI Workflow Audit. One row per purchase. A delivered audit always '
  'carries a human reviewer name and sign-off timestamp — enforced, not '
  'documented.';

comment on column public.ai_workflow_audits.sla_due_at is
  'Submission + 5 working days. Starts when the buyer submits, not when they '
  'pay: the queue cannot be late for work it has not received.';

create index if not exists ai_workflow_audits_user
  on public.ai_workflow_audits (user_id, purchased_at desc);

-- The reviewer queue: open audits, oldest SLA first.
create index if not exists ai_workflow_audits_open
  on public.ai_workflow_audits (sla_due_at)
  where status in ('submitted', 'in_progress');

-- Capacity is counted off this: an audit that is paid for but unsubmitted still
-- occupies a slot, because it is a promise we have already taken money for.
create index if not exists ai_workflow_audits_open_all
  on public.ai_workflow_audits (status)
  where status <> 'delivered';


-- Guarantee 2. The model's draft, where the buyer cannot reach it.
create table if not exists public.ai_workflow_audit_drafts (
  audit_id     uuid primary key references public.ai_workflow_audits(id) on delete cascade,
  draft_text   text not null,
  model        text,
  generated_at timestamptz not null default now()
);

comment on table public.ai_workflow_audit_drafts is
  'Reviewer-only working material. No user policy exists on this table by '
  'design: the buyer bought a reviewed audit, and an unreviewed draft is not '
  'that. Never returned by a user-facing endpoint.';


alter table public.ai_workflow_audits       enable row level security;
alter table public.ai_workflow_audit_drafts enable row level security;

-- The buyer may read their own audits. Every write goes through the service
-- role: status is a lifecycle, not something a client sets.
drop policy if exists ai_workflow_audits_select_own on public.ai_workflow_audits;
create policy ai_workflow_audits_select_own on public.ai_workflow_audits
  for select to authenticated using (user_id = auth.uid());

revoke all on public.ai_workflow_audit_drafts from public, anon, authenticated;
grant select, insert, update, delete on public.ai_workflow_audits to service_role;
grant select, insert, update, delete on public.ai_workflow_audit_drafts to service_role;
