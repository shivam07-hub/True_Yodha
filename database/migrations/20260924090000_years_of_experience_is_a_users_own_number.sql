-- The number an employer's "3+ years" is actually compared against.
--
-- Retrieval matches a person against the experience range an employer states,
-- and nothing in the account could answer it. The seniority band cannot: `mid`
-- admits entry AND mid roles (job_eligibility._AT_LEVEL), which is the right
-- rule for eligibility and useless as a quantity.
--
-- `services/experience_years.seniority_from_cv` already computes it and throws
-- it away, keeping only the band. It is worth keeping because of HOW it
-- computes: it sums each experience row's own date range rather than spanning
-- the first date to the last. On the CV that started this work that is the
-- difference between 3 years and 15 — she has 3.2 years of engineering either
-- side of a seven-year career break, and the span reading would have matched
-- her against senior roles for the rest of her time on the platform.
--
-- Verified against that CV before this shipped: rows "Aug 2026 – Present",
-- "Jan 2026 – Aug 2026" and "Jan 2016 – Jul 2018" return
-- {'value': 'mid', 'years': 3} — the band she already had, and the number we
-- were discarding.
--
-- `years_experience_source` exists because the CEO's decision (2026-09-23) was
-- "read the CV, let her correct it". A correction has to survive the next
-- re-parse, so the writer checks the source before overwriting. NULL means
-- never derived — which is not zero, and must never be matched as zero.
--
-- Additive and reversible: drop two columns.

alter table public.user_profiles
  add column if not exists years_experience numeric(4,1),
  add column if not exists years_experience_source text
    check (years_experience_source is null or years_experience_source in ('cv', 'user'));

comment on column public.user_profiles.years_experience is
  'Professional years in the craft, as an employer''s "3+ years" means it. Derived from the CV by services/experience_years.seniority_from_cv, which SUMS each experience row''s own date range — never the span from first date to last, which reads 15 years for someone with 3.2 either side of a career break. The user may correct it; see years_experience_source.';

comment on column public.user_profiles.years_experience_source is
  '"cv" = we read it. "user" = she corrected it, and a re-parse must not overwrite her. NULL = never derived, which is not the same as zero and must never be matched as such.';

notify pgrst, 'reload schema';
