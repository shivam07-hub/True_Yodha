-- 20260705_anon_cv_download_events.sql — backlog #34 S6
--
-- Metadata-only telemetry for pre-login CV downloads (grill Q13b = C).
-- PV1-CLEAN: stores NO CV content and NO identity — only a random,
-- client-generated anon_session_id (which links forward to signup when the
-- same browser later claims its stashed CV), the score, the count of fixes,
-- and coarse context. The full downloaded CV body is deliberately NOT captured
-- here; body-capture is a separate, consent-gated change pending counsel (#17).
--
-- Manual-apply on Supabase, then reload PostgREST:
--   NOTIFY pgrst, 'reload schema';

create table if not exists public.anon_cv_download_events (
  id               bigserial primary key,
  anon_session_id  text,
  score            integer,
  fix_count        integer,
  career_level     text,
  file_format      text,
  saved_intent     boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists idx_anon_cv_dl_created
  on public.anon_cv_download_events (created_at desc);
create index if not exists idx_anon_cv_dl_session
  on public.anon_cv_download_events (anon_session_id);

-- RLS on, NO policies → only the service role (the admin client used by the
-- public download-event endpoint) can read or write. Anon browsers never touch
-- this table directly.
alter table public.anon_cv_download_events enable row level security;

comment on table public.anon_cv_download_events is
  '#34 S6 — metadata-only pre-login CV download telemetry. No CV body (body-capture is consent/counsel-gated, #17). anon_session_id links forward to signup.';
