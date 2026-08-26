from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

import pytest
from fastapi import HTTPException
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


def test_intake_accessible_before_payment(monkeypatch: pytest.MonkeyPatch) -> None:
    # Intake is now collected before payment, so a not-unlocked user can read it.
    monkeypatch.setattr(myrology_router, "_fetch_intake", lambda user_id: None)

    with TestClient(app) as client:
        response = client.get("/myrology/intake", headers={"Authorization": "Bearer token"})

    assert response.status_code == 200
    assert response.json() is None


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


# ── Booking lifecycle transition (G3) ───────────────────────────────────────

ADMIN_HEADERS = {"X-Myro-Admin-Token": "ops-secret"}


def test_transition_503_when_admin_token_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(myrology_router.settings, "myrology_admin_token", "")
    with TestClient(app) as client:
        response = client.patch("/myrology/bookings/bk-1/status", json={"status": "confirmed"})
    assert response.status_code == 503


def test_transition_401_on_bad_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(myrology_router.settings, "myrology_admin_token", "ops-secret")
    with TestClient(app) as client:
        response = client.patch(
            "/myrology/bookings/bk-1/status",
            json={"status": "confirmed"},
            headers={"X-Myro-Admin-Token": "wrong"},
        )
    assert response.status_code == 401


def test_transition_rejects_invalid_target_status(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(myrology_router.settings, "myrology_admin_token", "ops-secret")
    with TestClient(app) as client:
        response = client.patch(
            "/myrology/bookings/bk-1/status", json={"status": "requested"}, headers=ADMIN_HEADERS
        )
    assert response.status_code == 422  # 'requested' not in the Literal target set


def test_transition_confirms_and_stamps_timestamp(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(myrology_router.settings, "myrology_admin_token", "ops-secret")

    def _transition(booking_id: str, new_status: str) -> dict[str, Any]:
        assert booking_id == "bk-1"
        assert new_status == "confirmed"
        return {
            "id": "bk-1",
            "preferred_windows": "Weekday evenings IST",
            "topic": None,
            "status": "confirmed",
            "created_at": "2026-06-09T00:00:00+00:00",
            "confirmed_at": "2026-06-09T01:00:00+00:00",
        }

    monkeypatch.setattr(myrology_router, "_transition_booking", _transition)

    with TestClient(app) as client:
        response = client.patch(
            "/myrology/bookings/bk-1/status", json={"status": "confirmed"}, headers=ADMIN_HEADERS
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "confirmed"
    assert body["confirmed_at"] == "2026-06-09T01:00:00Z"


def _admin_with_row(row: Any, update_data: Any) -> Any:
    """Fake supabase admin whose select returns `row` and update returns `update_data`."""

    class _Q:
        def select(self, *_a: Any, **_k: Any) -> "_Q":
            return self

        def eq(self, *_a: Any, **_k: Any) -> "_Q":
            return self

        def maybe_single(self) -> "_Q":
            return self

        def update(self, _payload: dict[str, Any]) -> "_Q":
            return self

        def execute(self) -> Any:
            return type("R", (), {"data": self._mode})()

    class _SelectQ(_Q):
        _mode = row

    class _UpdateQ(_Q):
        _mode = update_data

    class _Admin:
        def table(self, _name: str) -> Any:
            return _Router()

    class _Router:
        def select(self, *_a: Any, **_k: Any) -> Any:
            return _SelectQ()

        def update(self, _payload: dict[str, Any]) -> Any:
            return _UpdateQ()

    return _Admin()


def test_transition_booking_rejects_terminal_state(monkeypatch: pytest.MonkeyPatch) -> None:
    # A 'done' booking cannot move to 'confirmed'.
    admin = _admin_with_row({"id": "bk-1", "status": "done"}, [{"id": "bk-1", "status": "confirmed"}])
    monkeypatch.setattr(myrology_router, "get_supabase_admin", lambda: admin)

    with pytest.raises(myrology_router.HTTPException) as exc:
        myrology_router._transition_booking("bk-1", "confirmed")
    assert exc.value.status_code == 409


def test_transition_booking_404_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    admin = _admin_with_row(None, None)
    monkeypatch.setattr(myrology_router, "get_supabase_admin", lambda: admin)
    with pytest.raises(myrology_router.HTTPException) as exc:
        myrology_router._transition_booking("nope", "confirmed")
    assert exc.value.status_code == 404


def test_order_promises_a_date_four_working_days_from_payment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Thursday 2026-08-06 + 4 working days = Wednesday 2026-08-12 (skips the
    # weekend). The promise must come off the verified payment, not "now".
    monkeypatch.setattr(myrology_router, "_require_unlocked", lambda user_id: None)
    monkeypatch.setattr(
        myrology_router,
        "_fetch_paid_at",
        lambda user_id: datetime(2026, 8, 6, 9, 40, tzinfo=timezone.utc),
    )

    with TestClient(app) as client:
        response = client.get("/myrology/order", headers={"Authorization": "Bearer token"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["promised_by"] == "2026-08-12"
    assert body["working_days"] == 4
    assert body["paid_at"].startswith("2026-08-06")


def test_order_is_null_when_the_unlock_has_no_billing_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A hand-granted entitlement has nothing in billing_payments. The surface
    # must drop the dated promise, not fail the whole panel.
    monkeypatch.setattr(myrology_router, "_require_unlocked", lambda user_id: None)
    monkeypatch.setattr(myrology_router, "_fetch_paid_at", lambda user_id: None)

    with TestClient(app) as client:
        response = client.get("/myrology/order", headers={"Authorization": "Bearer token"})

    assert response.status_code == 200
    assert response.json() is None


def test_order_stays_behind_the_paid_gate(monkeypatch: pytest.MonkeyPatch) -> None:
    def _locked(user_id: str) -> None:
        raise HTTPException(status_code=403, detail="Myrology is locked.")

    monkeypatch.setattr(myrology_router, "_require_unlocked", _locked)

    with TestClient(app) as client:
        response = client.get("/myrology/order", headers={"Authorization": "Bearer token"})

    assert response.status_code == 403


@pytest.mark.parametrize(
    ("start", "days", "expected"),
    [
        # Friday + 1 lands on Monday, not Saturday.
        ((2026, 8, 7), 1, (2026, 8, 10)),
        # A Saturday payment burns no working day until Monday.
        ((2026, 8, 8), 4, (2026, 8, 13)),
        # A clean mid-week run stays inside the week.
        ((2026, 8, 3), 4, (2026, 8, 7)),
    ],
)
def test_working_day_arithmetic_skips_weekends(
    start: tuple[int, int, int], days: int, expected: tuple[int, int, int]
) -> None:
    assert myrology_router._add_working_days(date(*start), days) == date(*expected)
