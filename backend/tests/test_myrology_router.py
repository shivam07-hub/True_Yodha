from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import myrology as myrology_router


@pytest.fixture(autouse=True)
def _auth_override() -> None:
    app.dependency_overrides[myrology_router.get_principal] = lambda: myrology_router.Principal(
        id="user-1",
        email="native@himyro.com",
    )
    yield
    app.dependency_overrides.pop(myrology_router.get_principal, None)


class _FakeExec:
    def __init__(self, data: Any) -> None:
        self._data = data

    def select(self, *_a: Any, **_k: Any) -> "_FakeExec":
        return self

    def eq(self, *_a: Any, **_k: Any) -> "_FakeExec":
        return self

    def maybe_single(self) -> "_FakeExec":
        return self

    def execute(self) -> Any:
        return type("R", (), {"data": self._data})()


class _FakeAdmin:
    def __init__(self, profile_row: Any) -> None:
        self._row = profile_row

    def table(self, _name: str) -> _FakeExec:
        return _FakeExec(self._row)


def test_intake_returns_403_when_locked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(myrology_router, "get_supabase_admin", lambda: _FakeAdmin({"myrology_unlocked": False}))

    with TestClient(app) as client:
        response = client.get("/myrology/intake", headers={"Authorization": "Bearer token"})

    assert response.status_code == 403
    assert "locked" in response.json()["detail"].lower()


def test_save_intake_normalizes_unknown_time(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    monkeypatch.setattr(myrology_router, "_require_unlocked", lambda user_id: None)

    def _upsert(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        captured.update(payload)
        return {
            "dob": payload["dob"],
            "birth_time": payload["birth_time"],
            "birth_time_unknown": payload["birth_time_unknown"],
            "birth_place": payload["birth_place"],
            "guidance_note": payload["guidance_note"],
            "updated_at": "2026-05-28T00:00:00+00:00",
        }

    monkeypatch.setattr(myrology_router, "_upsert_intake", _upsert)

    with TestClient(app) as client:
        response = client.post(
            "/myrology/intake",
            json={
                "dob": "1996-10-07",
                "birth_time": "14:30:00",
                "birth_time_unknown": True,
                "birth_place": "  Pune  ",
                "guidance_note": "career switch",
            },
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 200, response.text
    # unknown time wins even if a time was sent; place is trimmed
    assert captured["birth_time"] is None
    assert captured["birth_place"] == "Pune"
    assert captured["dob"] == "1996-10-07"


def test_create_booking_persists_and_emails_astrologer(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: dict[str, Any] = {}

    monkeypatch.setattr(myrology_router, "_require_unlocked", lambda user_id: None)
    monkeypatch.setattr(
        myrology_router,
        "_fetch_intake",
        lambda user_id: {
            "dob": "1996-10-07",
            "birth_time": None,
            "birth_time_unknown": True,
            "birth_place": "Pune",
            "guidance_note": "career switch",
        },
    )
    monkeypatch.setattr(
        myrology_router,
        "_insert_booking",
        lambda user_id, payload: {
            "id": "bk-1",
            "preferred_windows": payload["preferred_windows"],
            "topic": payload["topic"],
            "status": "requested",
            "created_at": "2026-05-28T00:00:00+00:00",
        },
    )
    monkeypatch.setattr(myrology_router.settings, "myrology_astrologer_email", "astro@himyro.com")

    def _send(*, to: str, subject: str, text: str) -> bool:
        sent.update({"to": to, "subject": subject, "text": text})
        return True

    monkeypatch.setattr(myrology_router.email_service, "send_email", _send)

    with TestClient(app) as client:
        response = client.post(
            "/myrology/booking",
            json={"preferred_windows": "Weekday evenings IST", "topic": "10th house"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 201, response.text
    assert response.json()["status"] == "requested"
    assert sent["to"] == "astro@himyro.com"
    # native contact relayed; birth details included; no name (privacy-first)
    assert "native@himyro.com" in sent["text"]
    assert "Pune" in sent["text"]
    assert "Weekday evenings IST" in sent["text"]


def test_create_booking_survives_email_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(myrology_router, "_require_unlocked", lambda user_id: None)
    monkeypatch.setattr(myrology_router, "_fetch_intake", lambda user_id: None)
    monkeypatch.setattr(
        myrology_router,
        "_insert_booking",
        lambda user_id, payload: {
            "id": "bk-2",
            "preferred_windows": payload["preferred_windows"],
            "topic": None,
            "status": "requested",
            "created_at": "2026-05-28T00:00:00+00:00",
        },
    )
    # email returns False (e.g. no API key) — booking must still succeed
    monkeypatch.setattr(myrology_router.email_service, "send_email", lambda **_kwargs: False)

    with TestClient(app) as client:
        response = client.post(
            "/myrology/booking",
            json={"preferred_windows": "Any morning"},
            headers={"Authorization": "Bearer token"},
        )

    assert response.status_code == 201, response.text
    assert response.json()["id"] == "bk-2"
