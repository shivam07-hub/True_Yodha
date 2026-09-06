"""Notice harvest — Railway deaths and belt recovery are facts, not routes."""

from __future__ import annotations

from pathlib import Path

from app.notice.harvest import (
    flatten_deployments,
    harvest_belts,
    harvest_upload_stalls,
    sightings_from_deployments,
)
from app.notice.proofs import proofs_from_tests
from app.notice.fingerprint import cause_key_for


def test_crashed_api_is_crash_not_the_route() -> None:
    sightings = sightings_from_deployments(
        [{"status": "CRASHED"}, {"status": "SUCCESS"}],
        "mirror-backend-prod",
    )
    assert len(sightings) == 1
    assert cause_key_for(sightings[0]) == "process_death:mirror-backend-prod:crash"


def test_failed_deploy_and_worker_exit() -> None:
    failed = sightings_from_deployments(
        [{"status": "FAILED"}],
        "mirror-backend-prod",
    )
    runner = sightings_from_deployments(
        [{"status": "CRASHED"}],
        "True_Yodha",
    )
    oom = sightings_from_deployments(
        [{"status": "CRASHED", "reason": "OOM killed"}],
        "mirror-backend-prod",
    )
    assert cause_key_for(failed[0]) == "process_death:mirror-backend-prod:failed_deploy"
    assert cause_key_for(runner[0]) == "process_death:True_Yodha:runner_exit"
    assert cause_key_for(oom[0]) == "process_death:mirror-backend-prod:oom"


def test_flatten_graphql_edges() -> None:
    rows = flatten_deployments(
        {"deployments": {"edges": [{"node": {"status": "FAILED"}}]}}
    )
    assert rows == [{"status": "FAILED"}]


def test_belt_recovery_is_a_proof_not_a_sighting() -> None:
    sightings, proofs = harvest_belts(
        skill_awaiting=0,
        verifier_state="ok",
        sha="abc",
        on_main=True,
        alert_above=100,
    )
    assert sightings == []
    keys = {proof.cause_key for proof in proofs}
    assert keys == {"dead_man:skill_floor", "dead_man:listing_verifier"}


def test_belt_stall_opens_dead_man() -> None:
    sightings, proofs = harvest_belts(
        skill_awaiting=120,
        verifier_state="stalled",
        sha="abc",
        on_main=True,
    )
    assert proofs == []
    keys = {cause_key_for(item) for item in sightings}
    assert keys == {"dead_man:skill_floor", "dead_man:listing_verifier"}


def test_upload_stall_harvest() -> None:
    assert harvest_upload_stalls(False) == []
    assert cause_key_for(harvest_upload_stalls(True)[0]) == (
        "upload_guarantee:job_never_claimed"
    )


def test_proofs_from_tests_read_the_marker(tmp_path: Path) -> None:
    tests = tmp_path / "tests"
    tests.mkdir()
    (tests / "test_notice_close_demo.py").write_text(
        'NOTICE_CAUSE_KEY = "unhandled_500:RuntimeError:app/x.py:y"\n',
        encoding="utf-8",
    )
    proofs = proofs_from_tests(tests, sha="sha", on_main=True)
    assert len(proofs) == 1
    assert proofs[0].cause_key == "unhandled_500:RuntimeError:app/x.py:y"
    assert proofs[0].on_main is True
