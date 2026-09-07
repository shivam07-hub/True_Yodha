"""Step 3's record lives on the PERSON, not the job.

The rail leads with "Clear a step once and it counts wherever it applies".
For step 3 that was false by construction — the set was requirement STRINGS
keyed by job, so the same story rehearsed in seven rooms started from zero
seven times. These pin the claim.
"""
from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.services import prep_ladder, prep_rehearsal
from app.services.jd_coverage import CACHE_PROMPT_KEY, payload_to_result

KOTAK = "11111111-1111-1111-1111-111111111111"
CEO = "22222222-2222-2222-2222-222222222222"


def _coverage(rows: list[tuple[str, str | None]]) -> str:
    """(requirement, story_id) — a None story is a gap: nothing to rehearse."""
    return json.dumps({
        "requirements": [
            {
                "requirement": req,
                "status": "gap" if sid is None else "covered",
                "story_id": sid,
                "story_title": "",
                "story_pointer": "",
            }
            for req, sid in rows
        ]
    })


SANOFI = [("Lead programme delivery", KOTAK), ("Brief the exec", CEO)]
# 3M words its requirement differently but leans on the SAME story.
THREE_M = [("Own cross-functional delivery", KOTAK), ("Model the portfolio", None)]


class _FakeRepo:
    """Two rooms, one story bank. Models only what rehearsal may touch."""

    def __init__(self, rehearsed: set[str] | None = None) -> None:
        self.coverage = {"sanofi": _coverage(SANOFI), "3m": _coverage(THREE_M)}
        self.rehearsed = set(rehearsed or ())
        self.writes: list[tuple[str, bool]] = []
        self.owned = {KOTAK, CEO}

    def get_deepening(self, user_id: str, job_id: str, prompt_key: str) -> str | None:
        if prompt_key != CACHE_PROMPT_KEY:
            return None
        return self.coverage.get(job_id)

    def get_prep_user_state(self) -> dict[str, Any]:
        return {"skills": {}, "rehearsed": sorted(self.rehearsed)}

    def set_story_rehearsed(self, story_id: str, rehearsed: bool) -> bool:
        self.writes.append((story_id, rehearsed))
        if story_id not in self.owned:  # RLS matches no row
            return False
        self.rehearsed.add(story_id) if rehearsed else self.rehearsed.discard(story_id)
        return True

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(f"rehearsal reached an unmodelled repo method: {name!r}")


class TestOnePlatform:
    def test_rehearsing_once_counts_in_the_other_room(self) -> None:
        """The whole claim. Different JD wording, same story, same person."""
        repo = _FakeRepo()
        prep_rehearsal.set_rehearsed(repo, "u1", "sanofi", KOTAK, True)
        assert prep_rehearsal.read_state(repo, "u1", "3m")["answered"] == 1

    def test_the_ladder_agrees_with_the_panel_across_rooms(self) -> None:
        repo = _FakeRepo({KOTAK})
        rehearsed = set(repo.get_prep_user_state()["rehearsed"])
        three_m = payload_to_result(repo.get_deepening("u1", "3m", CACHE_PROMPT_KEY))[0]
        # 3M asks one rehearsable question and it is already worked.
        assert prep_ladder.rehearsal_step(three_m, rehearsed) == prep_ladder.CLEAR

    def test_unmarking_carries_too(self) -> None:
        repo = _FakeRepo({KOTAK})
        prep_rehearsal.set_rehearsed(repo, "u1", "3m", KOTAK, False)
        assert prep_rehearsal.read_state(repo, "u1", "sanofi")["answered"] == 0


class TestWhatCounts:
    def test_a_gap_is_not_rehearsable(self) -> None:
        """No story means nothing to say yet — that is step 1's problem, and
        counting it would leave step 3 unclearable for anyone with a gap."""
        repo = _FakeRepo({KOTAK})
        state = prep_rehearsal.read_state(repo, "u1", "3m")
        assert state["total"] == 1

    def test_a_room_with_no_coverage_has_nothing_to_rehearse(self) -> None:
        repo = _FakeRepo()
        assert prep_rehearsal.read_state(repo, "u1", "unknown-job") == {
            "rehearsed": [], "answered": 0, "total": 0,
        }

    def test_step_three_needs_every_rehearsable_story(self) -> None:
        repo = _FakeRepo({KOTAK})
        sanofi = payload_to_result(repo.get_deepening("u1", "sanofi", CACHE_PROMPT_KEY))[0]
        rehearsed = set(repo.get_prep_user_state()["rehearsed"])
        assert prep_ladder.rehearsal_step(sanofi, rehearsed) == prep_ladder.STARTED
        repo.set_story_rehearsed(CEO, True)
        assert prep_ladder.rehearsal_step(sanofi, set(repo.get_prep_user_state()["rehearsed"])) == prep_ladder.CLEAR

    def test_a_room_that_asks_nothing_rehearsable_is_not_started(self) -> None:
        repo = _FakeRepo({KOTAK})
        repo.coverage["gapsonly"] = _coverage([("Something unanswered", None)])
        cov = payload_to_result(repo.get_deepening("u1", "gapsonly", CACHE_PROMPT_KEY))[0]
        assert prep_ladder.rehearsal_step(cov, {KOTAK}) == prep_ladder.NOT_STARTED

    def test_a_duplicate_story_across_requirements_counts_once(self) -> None:
        repo = _FakeRepo()
        repo.coverage["dupe"] = _coverage([("A", KOTAK), ("B", KOTAK)])
        cov = payload_to_result(repo.get_deepening("u1", "dupe", CACHE_PROMPT_KEY))[0]
        assert prep_ladder.rehearsal_progress(cov, {KOTAK}) == (1, 1)


class TestRefusals:
    def test_a_story_this_room_never_asks_is_refused(self) -> None:
        """Otherwise a job id plus a story id is a way to flip rows the surface
        never showed."""
        repo = _FakeRepo()
        prep_rehearsal.set_rehearsed(repo, "u1", "3m", CEO, True)
        assert repo.writes == []
        assert repo.rehearsed == set()

    def test_a_story_that_is_not_yours_writes_nothing(self) -> None:
        """RLS is auth.uid() = user_id on career_stories, so the update matches
        no row. The endpoint must not pretend it worked."""
        repo = _FakeRepo()
        repo.owned = set()
        state = prep_rehearsal.set_rehearsed(repo, "u1", "sanofi", KOTAK, True)
        assert state["answered"] == 0


@pytest.fixture
def client_repo():
    repo = _FakeRepo()
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            yield client, repo
    finally:
        app.dependency_overrides.clear()


def test_endpoint_round_trip(client_repo) -> None:
    client, _repo = client_repo
    assert client.get("/preparations/sanofi/rehearsal").json() == {
        "rehearsed": [], "answered": 0, "total": 2,
    }
    put = client.put(
        "/preparations/sanofi/rehearsal", json={"story_id": KOTAK, "rehearsed": True}
    )
    assert put.status_code == 200
    assert put.json() == {"rehearsed": [KOTAK], "answered": 1, "total": 2}
    # And it is already true in the other room, which the client never named.
    assert client.get("/preparations/3m/rehearsal").json()["answered"] == 1
