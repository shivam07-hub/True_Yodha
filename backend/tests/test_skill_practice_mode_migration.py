"""Contracts for the L3 practice-mode and split-demand migration."""

from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "database/migrations/20260813180000_skill_practice_mode.sql"
)
SERVICE_POLICY = (
    Path(__file__).resolve().parents[2]
    / "database/migrations/20260813180500_skill_scenario_demand_service_policy.sql"
)


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_practice_mode_is_l3_scoped_and_generated() -> None:
    sql = _sql()
    generated = sql.split("add column if not exists practice_mode text", 1)[1]
    generated = generated.split(") stored;", 1)[0]

    assert "generated always as" in generated.lower()
    assert "practice_mode_override" in generated
    assert "Physical and Inherent Abilities" in generated
    assert "Communication" not in generated


def test_mixed_behavioral_skills_are_reviewed_individually() -> None:
    sql = _sql()
    corrections = sql.split("expected constant text[]", 1)[1].split("];", 1)[0]

    assert "'Communication'" in corrections
    assert "'Collaboration'" in corrections
    assert "'Cross-Functional Collaboration'" in corrections
    assert "raise exception" in sql.lower()


def test_levelled_and_scenario_demand_have_separate_rank_sequences() -> None:
    sql = _sql().lower()

    assert "create table if not exists public.skill_scenario_demand_snapshot" in sql
    assert "partition by location_city, window_key, practice_mode" in sql
    assert "where practice_mode = 'levelled'" in sql
    assert "where practice_mode = 'scenario'" in sql
    assert "delete from public.skill_demand_snapshot" in sql
    assert "delete from public.skill_scenario_demand_snapshot" in sql


def test_v2_job_skill_rpc_preserves_depth_and_practice_mode() -> None:
    sql = _sql().lower()
    fn = sql.split("fetch_job_skills_by_job_ids_v2", 1)[1]

    assert "required_level integer" in fn
    assert "practice_mode text" in fn
    assert "security invoker" in fn
    assert "security definer" not in fn.split("$function$;", 1)[0]
    assert "revoke all on function public.fetch_job_skills_by_job_ids_v2(text[])" in sql
    assert "from public, anon" in sql
    assert "to authenticated, service_role" in sql


def test_scenario_projection_is_service_only_and_indexed_for_fk_deletes() -> None:
    sql = _sql().lower()

    assert "alter table public.skill_scenario_demand_snapshot enable row level security" in sql
    assert "revoke all on table public.skill_scenario_demand_snapshot" in sql
    assert "to service_role" in sql
    assert "idx_skill_scenario_demand_snapshot_skill" in sql


def test_scenario_projection_has_an_explicit_service_only_policy() -> None:
    sql = SERVICE_POLICY.read_text(encoding="utf-8").lower()

    assert "create policy \"skill scenario demand service only\"" in sql
    assert "to service_role" in sql
    assert "to authenticated" not in sql
    assert "to anon" not in sql
