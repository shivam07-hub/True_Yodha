"""`/tracks` — what the surface is allowed to see and do.

The gate is the point of this router. A second search that can be opened by
anyone at any time is a setting; one that opens when the first has been run
through to a tailored CV is a next step.
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal, get_user_db
from app.main import app
from app.routers import job_tracks as router_mod

USER = "11111111-1111-1111-1111-111111111111"
TAILORED = {"tailored_cv_created_at": "2026-08-28T00:00:00Z"}


class _Tracks:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows = rows or []
        self.created: list[dict[str, Any]] = []
        self.archived: list[int] = []
        self.updated: list[tuple[int, dict[str, Any]]] = []

    def list_for_user(self, _user_id: str) -> list[dict[str, Any]]:
        return self.rows

    def create(self, user_id, *, label, role_titles, position):
        row = {
            "id": 90 + len(self.created),
            "user_id": user_id,
            "label": label,
            "role_titles": role_titles,
            "position": position,
        }
        self.created.append(row)
        self.rows.append(row)
        return row

    def update(self, _user_id, track_id, patch):
        self.updated.append((track_id, patch))
        for row in self.rows:
            if row["id"] == track_id:
                row.update(patch)
                return row
        return None

    def archive(self, _user_id, track_id):
        self.archived.append(track_id)
        before = len(self.rows)
        self.rows = [row for row in self.rows if row["id"] != track_id]
        return len(self.rows) < before


@pytest.fixture
def wired(monkeypatch):
    """Swap the three repositories the router builds from one db handle."""

    def _wire(*, rows=None, profile=None, state=None):
        tracks = _Tracks(rows)
        monkeypatch.setattr(
            router_mod,
            "_repos",
            lambda _db: (
                tracks,
                type("U", (), {"get_profile": lambda _s, _u: profile or {}})(),
                type("O", (), {"get_state": lambda _s, _u: state})(),
            ),
        )
        app.dependency_overrides[get_principal] = lambda: Principal(id=USER, token="t")
        app.dependency_overrides[get_user_db] = lambda: object()
        return tracks

    yield _wire
    app.dependency_overrides.clear()


def test_a_user_with_no_stored_track_still_sees_one_search(wired):
    wired(profile={"target_role_titles": ["Consulting"]})
    with TestClient(app) as client:
        body = client.get("/tracks").json()

    assert len(body["tracks"]) == 1
    assert body["tracks"][0] == {
        "id": None,
        "label": "Consulting",
        "role_titles": ["Consulting"],
        "position": 1,
        "is_profile": True,
    }


def test_the_gate_is_shut_until_the_first_search_produced_a_tailored_cv(wired):
    wired(profile={"target_role_titles": ["Consulting"]}, state={})
    with TestClient(app) as client:
        body = client.get("/tracks").json()

    assert body["can_open"] is False
    assert body["blocked_reason"] == "Tailor a CV for a job in this search first."
    assert "lock" not in body["blocked_reason"].lower()


def test_a_tailored_cv_opens_the_gate(wired):
    wired(profile={"target_role_titles": ["Consulting"]}, state=TAILORED)
    with TestClient(app) as client:
        body = client.get("/tracks").json()

    assert body["can_open"] is True
    assert body["blocked_reason"] is None


def test_opening_a_track_before_the_gate_is_refused_server_side(wired):
    """A client that forgets the gate must not be able to hand someone a second
    search before they have finished the first."""
    tracks = wired(profile={"target_role_titles": ["Consulting"]}, state={})
    with TestClient(app) as client:
        response = client.post("/tracks", json={"label": "Marketing"})

    assert response.status_code == 409
    assert response.json()["detail"] == "Tailor a CV for a job in this search first."
    assert tracks.created == []


def test_an_opened_track_starts_after_the_profile_and_keeps_its_words(wired):
    tracks = wired(profile={"target_role_titles": ["Consulting"]}, state=TAILORED)
    with TestClient(app) as client:
        response = client.post(
            "/tracks",
            json={"label": "Marketing", "role_titles": ["Marketing", "marketing", "Brand"]},
        )

    assert response.status_code == 201
    created = tracks.created[0]
    assert created["position"] == 2
    # Deduplicated case-insensitively, order preserved.
    assert created["role_titles"] == ["Marketing", "Brand"]
    assert [t["label"] for t in response.json()["tracks"]] == ["Consulting", "Marketing"]


def test_the_cap_counts_the_profile_track(wired):
    rows = [
        {"id": 7, "label": "Marketing", "role_titles": [], "position": 2},
        {"id": 8, "label": "Product", "role_titles": [], "position": 3},
    ]
    wired(rows=rows, profile={"target_role_titles": ["Consulting"]}, state=TAILORED)
    with TestClient(app) as client:
        body = client.get("/tracks").json()
        refused = client.post("/tracks", json={"label": "Design"})

    assert body["can_open"] is False
    assert refused.status_code == 409
    assert str(body["max_tracks"]) in refused.json()["detail"]


def test_closing_a_track_frees_its_position(wired):
    rows = [
        {"id": 7, "label": "Marketing", "role_titles": [], "position": 2},
        {"id": 8, "label": "Product", "role_titles": [], "position": 3},
    ]
    tracks = wired(rows=rows, profile={"target_role_titles": ["Consulting"]}, state=TAILORED)
    with TestClient(app) as client:
        assert client.delete("/tracks/7").status_code == 200
        client.post("/tracks", json={"label": "Design"})

    assert tracks.archived == [7]
    # Reuses 2 rather than leaking to 4 and rendering as a gap.
    assert tracks.created[0]["position"] == 2


def test_closing_a_track_that_is_not_yours_is_a_404(wired):
    wired(profile={}, state=TAILORED)
    with TestClient(app) as client:
        assert client.delete("/tracks/999").status_code == 404


def test_renaming_leaves_untouched_fields_alone(wired):
    rows = [{"id": 7, "label": "Marketing", "role_titles": ["Brand"], "position": 2}]
    tracks = wired(rows=rows, profile={}, state=TAILORED)
    with TestClient(app) as client:
        assert client.patch("/tracks/7", json={"label": "Growth"}).status_code == 200

    assert tracks.updated == [(7, {"label": "Growth"})]


def test_renaming_a_track_that_is_not_yours_is_a_404(wired):
    wired(profile={}, state=TAILORED)
    with TestClient(app) as client:
        assert client.patch("/tracks/999", json={"label": "Growth"}).status_code == 404
