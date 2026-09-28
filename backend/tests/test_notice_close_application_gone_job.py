"""Close proof: updating an application whose listing was unloaded.

`job_applications` has no FK to jobs — an application outlives its listing.
Its interest trigger inserted into `job_verification_interest`, which does,
so the PUT 500'd on a gone job. Probed on prod in a rolled-back block: the
application now saves, and a live job still records interest.
"""
from pathlib import Path

NOTICE_CAUSE_KEY = "unhandled_500:APIError:app/repositories/jobs.py:upsert_application"

SQL = (
    Path(__file__).parents[2] / "database/migrations/20260928110000_interest_needs_a_job.sql"
).read_text()


def _function(name: str) -> str:
    start = SQL.index(f"function public.{name}()")
    return SQL[start:SQL.index("$function$;", start)]


def test_neither_child_without_an_fk_records_interest_for_a_gone_job() -> None:
    for name in (
        "sync_job_verification_interest_application",
        "sync_job_verification_interest_exposure",
    ):
        body = _function(name)
        guard = body.index("EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = NEW.job_id)")
        assert guard < body.index("INSERT INTO public.job_verification_interest"), name
