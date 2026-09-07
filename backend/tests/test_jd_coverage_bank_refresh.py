"""A story banked in ONE room must stop other rooms saying "gap" about it.

`jd_coverage`'s own header has always said "coverage only changes when the user
banks a new story, so consumers refresh explicitly" — and no consumer ever did.
So answering a gap at Sanofi left 3M, Google and KPMG each still reporting the
same requirement as unanswered, forever. Myro is one platform; the story bank is
the user's, and every room's panel is a projection of it.
"""
from __future__ import annotations

import json
from typing import Any

import pytest

from app.services import jd_coverage
from app.services.jd_coverage import CACHE_PROMPT_KEY, CoverageItem, CoverageResult


class TestStaleFlag:
    def test_a_flagged_row_reads_as_stale(self) -> None:
        assert jd_coverage.is_stale(jd_coverage.mark_stale(_cached("2026-09-01T00:00:00+00:00")))

    def test_an_unflagged_row_does_not(self) -> None:
        assert not jd_coverage.is_stale(_cached("2026-09-01T00:00:00+00:00"))

    def test_flagging_twice_writes_once(self) -> None:
        """None means "nothing to do", so the caller skips the write."""
        once = jd_coverage.mark_stale(_cached("2026-09-01T00:00:00+00:00"))
        assert jd_coverage.mark_stale(once) is None

    def test_garbage_is_never_flagged_or_stale(self) -> None:
        for junk in (None, "", "not json", "{}", '{"requirements": []}'):
            assert jd_coverage.mark_stale(junk) is None
            assert not jd_coverage.is_stale(junk)

    def test_the_requirements_survive_flagging(self) -> None:
        """The flag must not disturb the row — the panel still renders from it
        until the re-match lands."""
        flagged = jd_coverage.mark_stale(_cached("2026-09-01T00:00:00+00:00"))
        result = jd_coverage.payload_to_result(flagged)
        assert result is not None
        assert result[0].requirements[0].requirement == "Lead a matrixed programme"


class _FakeJobsRepo:
    def __init__(self, payload: str | None) -> None:
        self.payload = payload
        self.writes: list[str] = []

    def get_deepening(self, user_id: str, job_id: str, prompt_key: str) -> str | None:
        return self.payload if prompt_key == CACHE_PROMPT_KEY else None

    def upsert_deepening(self, user_id: str, job_id: str, prompt_key: str, answer: str) -> None:
        self.writes.append(answer)
        self.payload = answer

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(f"coverage reached an unmodelled repo method: {name!r}")


def _cached(computed_at: str) -> str:
    return json.dumps({
        "computed_at": computed_at,
        "covered": 0, "weak": 0, "gap": 1,
        "requirements": [
            {"requirement": "Lead a matrixed programme", "status": "gap",
             "story_id": None, "story_title": "", "story_pointer": "",
             "similarity": 0.0, "source": "story"},
        ],
    })


@pytest.mark.asyncio
async def test_a_fresh_cache_is_served_untouched(monkeypatch) -> None:
    repo = _FakeJobsRepo(_cached("2026-09-05T00:00:00+00:00"))

    async def _boom(*a, **k):  # noqa: ANN002, ANN003
        raise AssertionError("must not re-match a cache the bank has not moved past")

    monkeypatch.setattr(jd_coverage, "rematch", _boom)
    result, cached, _at = await jd_coverage.assess_for_job(
        "u1", "j1", "jd", repo, {}, provider=None,
    )
    assert cached is True
    assert result.gap == 1
    assert repo.writes == []


@pytest.mark.asyncio
async def test_a_banked_story_re_matches_without_re_parsing(monkeypatch) -> None:
    """The requirement's WORDING must survive: re-parsing the same JD can
    shuffle phrasing and make a stable panel look unstable — the very thing the
    cache exists to prevent. Only the verdict may change."""
    repo = _FakeJobsRepo(jd_coverage.mark_stale(_cached("2026-09-01T00:00:00+00:00")))
    seen: dict[str, Any] = {}

    async def _never_parse(*a, **k):  # noqa: ANN002, ANN003
        raise AssertionError("re-parsing spends the judgment lane for nothing")

    async def _rematch(user_id, requirements, *, cv_bullets=None):  # noqa: ANN001
        seen["requirements"] = requirements
        return CoverageResult(
            requirements=[CoverageItem(
                requirement=requirements[0], status="covered", story_id="s1",
                story_title="Kotak 811 relaunch",
            )],
            covered=1, weak=0, gap=0,
        )

    monkeypatch.setattr(jd_coverage, "parse_requirements", _never_parse)
    monkeypatch.setattr(jd_coverage, "rematch", _rematch)

    result, cached, _at = await jd_coverage.assess_for_job(
        "u1", "j1", "jd", repo, {}, provider=None,
    )
    assert seen["requirements"] == ["Lead a matrixed programme"]
    assert cached is False
    assert result.covered == 1 and result.gap == 0
    # The new verdict is written back — which also clears the flag, so the next
    # open is a plain cache hit again.
    assert json.loads(repo.writes[0])["requirements"][0]["story_id"] == "s1"
    assert not jd_coverage.is_stale(repo.writes[0])


@pytest.mark.asyncio
async def test_a_clean_row_never_recomputes(monkeypatch) -> None:
    """The flag is the only thing that triggers a re-match."""
    repo = _FakeJobsRepo(_cached("2026-09-01T00:00:00+00:00"))

    async def _boom(*a, **k):  # noqa: ANN002, ANN003
        raise AssertionError("an unflagged row must never recompute")

    monkeypatch.setattr(jd_coverage, "rematch", _boom)
    _result, cached, _at = await jd_coverage.assess_for_job(
        "u1", "j1", "jd", repo, {}, provider=None,
    )
    assert cached is True


class _SiblingRepo:
    """Three rooms, all with cached coverage."""

    def __init__(self) -> None:
        self.rows = {
            "sanofi": _cached("2026-09-01T00:00:00+00:00"),
            "3m": _cached("2026-09-01T00:00:00+00:00"),
            "google": _cached("2026-09-01T00:00:00+00:00"),
        }

    def list_coverage_rows(self, user_id: str, prompt_key: str) -> list[dict[str, Any]]:
        assert prompt_key == CACHE_PROMPT_KEY
        return [{"job_id": jid, "answer": raw} for jid, raw in self.rows.items()]

    def upsert_deepening(self, user_id: str, job_id: str, prompt_key: str, answer: str) -> None:
        self.rows[job_id] = answer


def test_banking_a_story_stales_every_other_room() -> None:
    """The claim, at the source. Answering at Sanofi has to change what 3M and
    Google are allowed to keep saying."""
    from app.routers.cv.career import _stale_other_rooms

    repo = _SiblingRepo()
    _stale_other_rooms(repo, "u1", "sanofi")

    assert not jd_coverage.is_stale(repo.rows["sanofi"]), "the answered room was just patched"
    assert jd_coverage.is_stale(repo.rows["3m"])
    assert jd_coverage.is_stale(repo.rows["google"])


def test_an_answer_with_no_job_stales_every_room() -> None:
    """A story banked outside a room — the CV dump lane — still moves them all."""
    from app.routers.cv.career import _stale_other_rooms

    repo = _SiblingRepo()
    _stale_other_rooms(repo, "u1", None)
    assert all(jd_coverage.is_stale(raw) for raw in repo.rows.values())


def test_a_failure_here_never_breaks_the_answer() -> None:
    """The user just answered a question. Losing that to a bookkeeping error on
    rooms they cannot see would be the worst possible trade."""
    from app.routers.cv.career import _stale_other_rooms

    class _Broken:
        def list_coverage_rows(self, *a: Any, **k: Any) -> list[dict[str, Any]]:
            raise RuntimeError("postgrest is having a day")

    _stale_other_rooms(_Broken(), "u1", "sanofi")
