from pathlib import Path


def test_interest_refresh_does_not_insert_after_the_job_is_gone() -> None:
    sql = (
        Path(__file__).parents[2]
        / "database/migrations/20260914001000_refresh_interest_skips_deleted_jobs.sql"
    ).read_text()
    assert "FROM public.jobs j WHERE j.job_id = p_job_id" in sql
    assert "INSERT INTO public.job_verification_interest" in sql
