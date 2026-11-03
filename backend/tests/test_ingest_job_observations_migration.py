from pathlib import Path


SQL = (
    Path(__file__).parents[2]
    / "database/migrations/20261103130000_ingest_writes_only_what_changed.sql"
).read_text()


def test_first_seen_is_written_on_insert_only() -> None:
    update_set = SQL.split("v_update_set := (", 1)[1].split(");", 1)[0]
    assert "k not in ('job_id', 'first_seen')" in update_set


def test_an_unchanged_row_gets_only_the_sighting_stamps() -> None:
    assert "k in ('last_seen', 'batch_date', 'is_active')" in SQL
    stamp = SQL.split("if cardinality(v_stamps) > 0 then", 1)[1]
    assert "and not (%2$s)" in stamp
    assert "is distinct from (%4$s)" in stamp


def test_a_changed_row_is_the_only_full_rewrite() -> None:
    assert "on conflict (job_id) do update set %2$s" in SQL
    assert "where %3$s" in SQL


def test_a_batch_shares_one_key_set_of_real_columns() -> None:
    assert "rows in one batch must share one key set" in SQL
    assert "not jobs columns" in SQL


def test_only_the_service_role_can_ingest() -> None:
    assert "revoke all on function public.ingest_job_observations(jsonb) from public, anon, authenticated;" in SQL
    assert "grant execute on function public.ingest_job_observations(jsonb) to service_role;" in SQL
    assert "notify pgrst, 'reload schema';" in SQL
