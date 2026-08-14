-- Make the service-only intent explicit to both Postgres and the security
-- advisor. service_role bypasses RLS, but a named policy keeps this table from
-- looking accidentally inaccessible while no browser role has table grants.

create policy "skill scenario demand service only"
  on public.skill_scenario_demand_snapshot
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
