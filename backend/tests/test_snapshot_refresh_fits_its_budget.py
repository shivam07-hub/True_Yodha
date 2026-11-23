"""A snapshot refresh fits its budget, and one that does not stops hammering.

Measured 2026-11-23 on prod (Micro):
- role_families timed out on 140 of 168 hourly runs in a week, 281 minutes of
  database work rolled back. Each of its five steps re-read the 53k live jobs
  from the 771 MB `jobs` table (25-33s a pass); five passes outgrew the
  2-minute statement timeout from 2026-11-17.
- ghost_index timed out on every daily run since 2026-11-08. It read `jobs`
  three times (17.6s a pass) and `job_listing_observations` three times
  (20.5s a pass, through two views and a union).
- A timeout is `query_canceled`, which PL/pgSQL's `when others` does not catch.
  The failure was never recorded, the task stayed `pending`, and the hourly
  retry ran the same doomed two minutes again, every hour.
"""

from __future__ import annotations

import re
from pathlib import Path

MIGRATION = (
    Path(__file__).parents[2] / "database" / "migrations" / "20261123120000_snapshot_refresh_fits_its_budget.sql"
).read_text(encoding="utf-8").lower()


def _function(name: str) -> str:
    body = MIGRATION.split(f"create or replace function public.{name}(")[1]
    return body.split("$function$;")[0]


def test_role_families_reads_the_live_jobs_once() -> None:
    fn = _function("refresh_role_family_labels")

    assert fn.count("from public.jobs") == 1
    assert fn.count("public.listing_is_live(") == 1
    assert "create temp table _rf_live on commit drop" in fn
    # Every step reads the one live set: labels, weights, bands, scope, profile.
    assert fn.count("pg_temp._rf_live") >= 6


def test_role_families_still_rebuilds_every_table_it_owned() -> None:
    fn = _function("refresh_role_family_labels")

    for table in (
        "role_family_labels",
        "role_family_skill_weights",
        "career_band_scope",
        "role_family_scope",
        "role_family_profile",
    ):
        assert f"public.{table}" in fn, table
    assert "'profile_rows', v_profile" in fn


def test_ghost_index_reads_jobs_and_observations_once_each() -> None:
    fn = _function("refresh_ghost_index")

    assert len(re.findall(r"\bfrom jobs\b", fn)) == 1
    assert len(re.findall(r"\bjob_listing_observations\b", fn)) == 1
    # The views each re-scan the observations; the refresh no longer reads them.
    assert not re.search(r"\b(from|join)\s+listing_(close_events|feed_presence)\b", fn)
    # The corpus count comes from the one base pass, not a second scan of jobs.
    assert "count(distinct company_name) into v_companies from _gi_base" in fn


def test_ghost_index_keeps_its_published_method() -> None:
    fn = _function("refresh_ghost_index")

    # The admissibility rule keeps its one home (a function, not a copy).
    assert "close_evidence_is_admissible(evidence)" in fn
    # A verifier confirmation counts wherever it is recorded.
    assert "greatest(o.verifier_seen_live, j.last_verified_live_at)" in fn
    assert "v_method   text := 'ghost-index-v2'" in fn
    assert "v_min_cell integer := 20" in fn
    assert "case when feed_overlap >= v_min_cell" in fn
    assert "case when scope = 'overall' and period = 'all' then v_companies end" in fn
    assert "percentile_cont" in fn


def test_a_timeout_is_recorded_as_a_failed_run() -> None:
    fn = _function("run_snapshot_sql_refresh")

    assert "exception when others or query_canceled then" in fn
    handler = fn.split("exception when others or query_canceled then")[1]
    assert "public.finish_snapshot_refresh(p_task, false" in handler


def test_a_failing_refresh_backs_off_instead_of_retrying_every_hour() -> None:
    assert "add column if not exists consecutive_failures integer not null default 0" in MIGRATION

    finish = _function("finish_snapshot_refresh")
    assert "consecutive_failures = case when p_success then 0 else consecutive_failures + 1 end" in finish

    claim = _function("claim_snapshot_refresh")
    assert "s.consecutive_failures = 0" in claim
    # 1h, 2h, 4h ... capped at a day; the exponent is capped so the interval cannot overflow.
    assert "least(s.consecutive_failures - 1, 5)" in claim
    assert "interval '24 hours'" in claim
