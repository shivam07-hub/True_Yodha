-- Myro Career Growth Command System, Phase 1.
-- Private-by-default: FastAPI service-role access only. No browser policies.

create extension if not exists pgcrypto;

create table if not exists public.growth_operators (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null default 'editor'
        check (role in ('owner', 'editor', 'analyst')),
    display_name text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz
);

create table if not exists public.growth_content_assets (
    id uuid primary key default gen_random_uuid(),
    legacy_key text unique,
    kind text not null
        check (kind in (
            'newsletter', 'article', 'guide', 'tool', 'company_page',
            'career_page', 'data_story', 'community_response'
        )),
    title text not null,
    slug text,
    summary text,
    canonical_url text,
    audience text,
    primary_action text,
    status text not null default 'draft'
        check (status in (
            'draft', 'ready_for_review', 'approved', 'published',
            'needs_refresh', 'archived'
        )),
    sensitivity text not null default 'low'
        check (sensitivity in ('low', 'medium', 'high')),
    evidence_fresh_until date,
    owner_id uuid references auth.users(id) on delete set null,
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    unique (kind, slug)
);

create table if not exists public.growth_campaigns (
    id uuid primary key default gen_random_uuid(),
    legacy_key text unique,
    asset_id uuid not null
        references public.growth_content_assets(id) on delete cascade,
    slug text not null,
    name text not null,
    objective text,
    audience text,
    status text not null default 'draft'
        check (status in (
            'draft', 'ready_for_review', 'approved', 'active',
            'completed', 'paused', 'archived'
        )),
    planned_at timestamptz,
    approved_by uuid references auth.users(id) on delete set null,
    approved_at timestamptz,
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    unique (asset_id, slug)
);

create table if not exists public.growth_messages (
    id uuid primary key default gen_random_uuid(),
    legacy_key text unique,
    campaign_id uuid not null
        references public.growth_campaigns(id) on delete cascade,
    asset_id uuid not null
        references public.growth_content_assets(id) on delete cascade,
    channel text not null,
    format text,
    variant text not null default 'primary',
    audience text,
    intent text,
    subject text,
    draft_copy text not null default '',
    final_copy text,
    call_to_action_url text,
    utm_url text,
    composer_url text,
    status text not null default 'draft'
        check (status in (
            'draft', 'ready_for_review', 'approved', 'scheduled',
            'published', 'failed', 'skipped', 'archived'
        )),
    automation_level text not null default 'assisted'
        check (automation_level in ('manual', 'assisted', 'automated')),
    sensitivity text not null default 'low'
        check (sensitivity in ('low', 'medium', 'high')),
    reviewer_id uuid references auth.users(id) on delete set null,
    approved_at timestamptz,
    planned_at timestamptz,
    failure_reason text,
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    unique (campaign_id, channel, variant)
);

create table if not exists public.growth_publications (
    id uuid primary key default gen_random_uuid(),
    legacy_key text unique,
    message_id uuid not null
        references public.growth_messages(id) on delete cascade,
    status text not null default 'published'
        check (status in ('published', 'failed', 'deleted')),
    live_url text,
    external_id text,
    published_at timestamptz not null default now(),
    outcome jsonb not null default '{}'::jsonb,
    failure_details text,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    unique (message_id, external_id)
);

create table if not exists public.growth_attribution_touchpoints (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    touch_kind text not null check (touch_kind in ('first', 'latest')),
    source text not null,
    medium text,
    campaign text,
    content text,
    term text,
    landing_path text not null,
    captured_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, touch_kind)
);

create index if not exists idx_growth_assets_status_updated
    on public.growth_content_assets(status, updated_at desc);
create index if not exists idx_growth_campaigns_asset_status
    on public.growth_campaigns(asset_id, status);
create index if not exists idx_growth_messages_review_queue
    on public.growth_messages(status, planned_at, updated_at desc);
create index if not exists idx_growth_messages_channel
    on public.growth_messages(channel, status);
create index if not exists idx_growth_publications_message_time
    on public.growth_publications(message_id, published_at desc);
create index if not exists idx_growth_attribution_campaign
    on public.growth_attribution_touchpoints(campaign, source, captured_at desc);

alter table public.growth_operators enable row level security;
alter table public.growth_content_assets enable row level security;
alter table public.growth_campaigns enable row level security;
alter table public.growth_messages enable row level security;
alter table public.growth_publications enable row level security;
alter table public.growth_attribution_touchpoints enable row level security;

comment on table public.growth_operators is
    'Server-validated allowlist for the private Growth Command Center.';
comment on table public.growth_content_assets is
    'Canonical useful answers from which channel derivatives are created.';
comment on table public.growth_publications is
    'Append-only evidence of actual publication attempts and outcomes.';
comment on table public.growth_attribution_touchpoints is
    'Bounded first/latest campaign attribution; never stores CV or application data.';

notify pgrst, 'reload schema';
