"""Close proof for the Stage A drain that outran its timeout and stranded jobs.

2026-09-30: a 14k-job scrape needed ~4h at ~50 jobs/min (a resolve and an upsert
per job), so RQ killed the drain at its 2h timeout, twice (AbandonedJobError).
Each kill landed mid-batch, and because the claim itself stamped
`skill_floor_attempted_at`, 96 and then 37 jobs were left "attempted" with no
skills — out of Stage A's work set for good. While the drain crawled, more than
100 jobs sat unattempted and the dead-man fired, then failed to close.

Now one resolve and one upsert serve a whole batch, the claim is a lease, and
the verdict is written only after the skills land. The behaviour is held by
`test_skill_floor.py`; this file holds the database half.
"""

from __future__ import annotations

from pathlib import Path

NOTICE_CAUSE_KEY = "work_lane:skill_floor_drain:AbandonedJobError"
NOTICE_CAUSE_KEY = "dead_man:skill_floor"

_LEASE = (
    Path(__file__).parents[2]
    / "database/migrations/20261003120000_skill_floor_claim_lease.sql"
)


def _function_body(sql: str, name: str) -> str:
    return sql.split(f"CREATE OR REPLACE FUNCTION public.{name}")[1].split("$function$")[1]


def test_the_claim_takes_a_lease_and_never_writes_the_verdict() -> None:
    claim = _function_body(_LEASE.read_text(), "claim_skill_floor_lease")

    assert "FOR UPDATE SKIP LOCKED" in claim
    assert "skill_floor_attempted_at IS NULL" in claim, "a settled job is never served again"
    assert "j.job_description IS NOT NULL" in claim, "the claim must match the monitor's work set"
    assert "SET skill_floor_claimed_at = now()" in claim
    assert "SET skill_floor_attempted_at" not in claim, "the claim must not be the verdict"
    assert "enrichment_status" not in claim, "Stage A must not write the enrichment lifecycle"


def test_an_unsettled_lease_is_served_again_and_its_owner_takes_it_back_at_once() -> None:
    claim = _function_body(_LEASE.read_text(), "claim_skill_floor_lease")

    assert "skill_floor_claimed_at < now() - interval '15 minutes'" in claim
    # RQ retries a killed drain within seconds under the same scrape run id.
    assert "skill_floor_claimed_by = p_owner" in claim


def test_only_settle_writes_the_verdict() -> None:
    settle = _function_body(_LEASE.read_text(), "settle_skill_floor_claims")

    assert "SET skill_floor_attempted_at = now()" in settle
    assert "job_id = ANY(p_job_ids)" in settle


def test_the_lease_rpcs_are_worker_only() -> None:
    sql = _LEASE.read_text()

    for signature in ("claim_skill_floor_lease(INTEGER, TEXT)", "settle_skill_floor_claims(TEXT[])"):
        assert (
            f"REVOKE ALL ON FUNCTION public.{signature} FROM PUBLIC, anon, authenticated;" in sql
        ), f"{signature} is reachable without service_role"
        assert f"GRANT EXECUTE ON FUNCTION public.{signature} TO service_role;" in sql
