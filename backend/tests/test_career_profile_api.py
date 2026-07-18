"""Career Profile (S1) — own-only read/write of the recruiter fact-layer + the
prose write-through to user_memory.

Progressive PATCH semantics: supplied keys merge, absent keys are preserved,
explicit null clears a key. Typed contract (CareerProfile) validates/coerces and
range-guards. The prose mirror is rebuilt on each save.
"""
from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.career_profile import (
    _prose_rows,
    get_career_profile_repository,
)


class _FakeRepo:
    def __init__(self) -> None:
        self.data: dict[str, dict[str, Any]] = {}
        self.mirror: dict[str, list[dict[str, Any]]] = {}
        self._seq = 0

    def get(self, user_id: str):
        return dict(self.data.get(user_id, {})), ("2026-07-18T00:00:00+00:00" if user_id in self.data else None)

    def write(self, user_id: str, data: dict[str, Any]) -> None:
        self.data[user_id] = dict(data)

    def rebuild_prose_mirror(self, user_id: str, profile: dict[str, Any]):
        rows = _prose_rows(profile)
        out = []
        for r in rows:
            self._seq += 1
            out.append({**r, "id": f"mem{self._seq}", "user_id": user_id})
        self.mirror[user_id] = out
        return out


def _override(repo: _FakeRepo, user_id: str = "u1") -> None:
    app.dependency_overrides[get_career_profile_repository] = lambda: repo
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=user_id, email=None, token="t1")


def _client() -> TestClient:
    return TestClient(app)


def test_get_empty_profile() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with _client() as c:
            resp = c.get("/career-profile", headers={"Authorization": "Bearer t1"})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200
    body = resp.json()
    # all-optional contract → every field null on an empty profile
    assert body["profile"]["notice_period_days"] is None
    assert body["updated_at"] is None


def test_patch_merges_and_preserves() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with _client() as c:
            h = {"Authorization": "Bearer t1"}
            c.patch("/career-profile", json={"profile": {"notice_period_days": 60}}, headers=h)
            # second PATCH sets a different key — must NOT wipe notice
            r2 = c.patch("/career-profile", json={"profile": {"expected_ctc_lpa": 32}}, headers=h)
    finally:
        app.dependency_overrides.clear()
    prof = r2.json()["profile"]
    assert prof["notice_period_days"] == 60
    assert prof["expected_ctc_lpa"] == 32.0


def test_patch_null_clears_key() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with _client() as c:
            h = {"Authorization": "Bearer t1"}
            c.patch("/career-profile", json={"profile": {"reporting_manager": "Alok Mishra"}}, headers=h)
            r2 = c.patch("/career-profile", json={"profile": {"reporting_manager": None}}, headers=h)
    finally:
        app.dependency_overrides.clear()
    assert r2.json()["profile"]["reporting_manager"] is None


def test_out_of_range_rejected() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with _client() as c:
            resp = c.patch(
                "/career-profile",
                json={"profile": {"notice_period_days": 9999}},
                headers={"Authorization": "Bearer t1"},
            )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 422  # ge/le guard on the typed contract


def test_unknown_key_ignored() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with _client() as c:
            resp = c.patch(
                "/career-profile",
                json={"profile": {"favourite_colour": "teal", "notice_period_days": 30}},
                headers={"Authorization": "Bearer t1"},
            )
    finally:
        app.dependency_overrides.clear()
    prof = resp.json()["profile"]
    assert "favourite_colour" not in prof
    assert prof["notice_period_days"] == 30


def test_prose_mirror_shapes_sensible_rows() -> None:
    rows = _prose_rows({
        "current_ctc_fixed_lpa": 24, "expected_ctc_lpa": 32,
        "notice_period_days": 60, "current_location": "Delhi NCR",
        "open_to_relocate": True, "reporting_manager": "Alok Mishra",
        "sales_target": "$5M / 500 resources", "target_achievement": "~40%",
        "new_logos_last_year": 0, "interview_availability": "Saturdays",
    })
    by_field = {r["resolved"]["field"]: r for r in rows}
    assert all(r["resolved"]["origin"] == "career_profile" for r in rows)
    assert by_field["ctc"]["kind"] == "salary"
    assert "₹24 LPA" in by_field["ctc"]["text"] and "₹32 LPA" in by_field["ctc"]["text"]
    assert by_field["notice_period_days"]["kind"] == "constraint"
    assert "60 days" in by_field["notice_period_days"]["text"]
    assert "Open to relocation" in by_field["location"]["text"]
    assert by_field["new_logos_last_year"]["text"] == "New logos added last year: 0."


def test_empty_profile_no_prose_rows() -> None:
    assert _prose_rows({}) == []
