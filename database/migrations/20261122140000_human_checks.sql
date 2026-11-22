-- Human Check: the promise the Apply Pack sells (#56 S2, M3; ENG3).
--
-- A named reviewer returns one check within 24 hours. A check is one of two
-- kinds: `cv_job` (a tailored CV read against one job) or `linkedin` (the
-- LinkedIn profile rewritten for the user to paste on a short call). A check
-- bought without a job or a profile waits as `unassigned` until the user uses
-- it. A LinkedIn check bought with 5,000 coins has no billing_payments row.
--
-- contact_whatsapp exists only to book the paste call and is cleared when the
-- reviewer closes the call. It is never granted to the browser role.
--
-- Additive. Reverse: drop table public.human_checks.

begin;

create table if not exists public.human_checks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.user_profiles (id) on delete cascade,
    billing_payment_id uuid null unique references public.billing_payments (id),
    kind text null check (kind in ('cv_job', 'linkedin')),
    job_id text null,
    status text not null default 'unassigned'
        check (status in ('unassigned', 'queued', 'in_review', 'delivered')),
    slot_starts_at timestamptz null,
    due_at timestamptz null,
    reviewer_name text null,
    note text null,
    reviewed_cv_version_id bigint null,
    linkedin_url text null,
    contact_whatsapp text null,
    draft jsonb null,
    blocks jsonb null,
    pasted_at timestamptz null,
    call_closed_at timestamptz null,
    delivered_at timestamptz null,
    created_at timestamptz not null default now(),

    -- A check has a kind exactly when it has been used.
    constraint human_checks_kind_when_used check ((status = 'unassigned') = (kind is null)),
    constraint human_checks_cv_job_has_job check (kind is distinct from 'cv_job' or job_id is not null),
    constraint human_checks_linkedin_has_url check (kind is distinct from 'linkedin' or linkedin_url is not null),
    -- Only a LinkedIn check can be bought with coins.
    constraint human_checks_paid_or_linkedin check (billing_payment_id is not null or kind = 'linkedin'),
    constraint human_checks_clock_when_queued check (
        status = 'unassigned' or (slot_starts_at is not null and due_at is not null)
    ),
    constraint human_checks_delivered_is_signed check (
        status <> 'delivered'
        or (
            delivered_at is not null and note is not null and reviewer_name is not null
            and ((kind = 'cv_job' and reviewed_cv_version_id is not null)
                 or (kind = 'linkedin' and blocks is not null))
        )
    )
);

create index if not exists idx_human_checks_status_due on public.human_checks (status, due_at);
create index if not exists idx_human_checks_user on public.human_checks (user_id, created_at desc);

alter table public.human_checks enable row level security;

drop policy if exists human_checks_select_own on public.human_checks;
create policy human_checks_select_own on public.human_checks
    for select to authenticated
    using (auth.uid() = user_id);

revoke all on public.human_checks from anon, authenticated;
grant select (
    id, user_id, billing_payment_id, kind, job_id, status, slot_starts_at, due_at,
    reviewer_name, note, reviewed_cv_version_id, linkedin_url, blocks, pasted_at,
    delivered_at, created_at
) on public.human_checks to authenticated;

commit;

notify pgrst, 'reload schema';
