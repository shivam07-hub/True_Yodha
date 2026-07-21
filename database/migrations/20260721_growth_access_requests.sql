-- Growth Distribution Tracker: self-serve access requests.
-- A signed-in user who is not on the operator allowlist can request access.
-- Private-by-default: FastAPI service-role access only. No browser policies.

create table if not exists public.growth_access_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    email text not null default '',
    note text,
    status text not null default 'pending'
        check (status in ('pending', 'granted', 'declined')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    unique (user_id)
);

create index if not exists idx_growth_access_requests_status
    on public.growth_access_requests(status, created_at desc);

alter table public.growth_access_requests enable row level security;

comment on table public.growth_access_requests is
    'Self-serve access requests for the private Distribution Tracker; owner promotes to growth_operators.';

notify pgrst, 'reload schema';
