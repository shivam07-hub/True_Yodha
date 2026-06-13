-- Restore hosted parity with the proven local Distribution Tracker.
-- Private-by-default: FastAPI service-role access only. No browser policies.

create table if not exists public.growth_seeding_sweeps (
    id uuid primary key default gen_random_uuid(),
    legacy_key text unique,
    sweep_date date not null,
    title text not null,
    summary text,
    body text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_growth_seeding_sweeps_date
    on public.growth_seeding_sweeps(sweep_date desc);

alter table public.growth_seeding_sweeps enable row level security;

alter table public.growth_publications
    add column if not exists final_copy_snapshot text;

update public.growth_publications gp
set final_copy_snapshot = coalesce(gm.final_copy, gm.draft_copy, '')
from public.growth_messages gm
where gm.id = gp.message_id
  and gp.final_copy_snapshot is null;

update public.growth_publications
set final_copy_snapshot = ''
where final_copy_snapshot is null;

alter table public.growth_publications
    alter column final_copy_snapshot set not null;

comment on table public.growth_seeding_sweeps is
    'Full opportunity sweeps that feed human-reviewed channel responses.';
comment on column public.growth_publications.final_copy_snapshot is
    'Immutable exact copy captured at publication time for voice learning.';

notify pgrst, 'reload schema';
