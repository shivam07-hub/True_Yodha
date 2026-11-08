-- The company's answer on an application to a paid internship hosted on Myro.
--
-- Written only by the person who posted the internship: seen (she opened the
-- applicant), then shortlisted or passed. It sits BESIDE the seeker's own
-- record and never touches it — applied_at is his Yes (CONTEXT: Application
-- Yes), status is his stage, company_response is his note of what a company
-- told him. NULL on every application to a career-page job.
--
-- Additive and reversible:
--   alter table public.job_applications drop column if exists employer_status_at;
--   alter table public.job_applications drop column if exists employer_status;

alter table public.job_applications
  add column if not exists employer_status text
    check (employer_status in ('seen', 'shortlisted', 'passed')),
  add column if not exists employer_status_at timestamptz;

notify pgrst, 'reload schema';
