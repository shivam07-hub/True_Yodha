"""The ₹599 intake stores consent and does not unlock anything else."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.filing_intake import get_filing_intake_repository
from app.routers import payments as payments_router


class _Intake:
    def __init__(self) -> None:
        self.row: dict[str, Any] | None = None

    def get(self, user_id: str) -> dict[str, Any] | None:
        _ = user_id
        return self.row

    def save(self, *, user_id: str, role: str, cities: str, portals: str) -> dict[str, Any]:
        paid = (self.row or {}).get("paid_at")
        self.row = {
            "user_id": user_id,
            "target_role": role.strip(),
            "cities": cities.strip(),
            "portals": portals.strip(),
            "consented_at": "now",
            "paid_at": paid,
        }
        return self.row


def test_consent_and_the_three_fields_are_required() -> None:
    repo = _Intake()
    app.dependency_overrides[get_filing_intake_repository] = lambda: repo
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1", email=None)
    try:
        with TestClient(app) as client:
            missing = client.post(
                "/filing-intake",
                json={"target_role": "Analyst", "cities": "", "portals": "careers", "consent": True},
            )
            refused = client.post(
                "/filing-intake",
                json={
                    "target_role": "Analyst",
                    "cities": "Bengaluru",
                    "portals": "https://careers.example.com",
                    "consent": False,
                },
            )
            saved = client.post(
                "/filing-intake",
                json={
                    "target_role": "Analyst",
                    "cities": "Bengaluru",
                    "portals": "https://careers.example.com",
                    "consent": True,
                },
            )
        assert missing.status_code == 422
        assert refused.status_code == 422
        assert saved.status_code == 200
        assert saved.json()["saved"] is True
        assert saved.json()["paid"] is False
        assert repo.row is not None
        assert repo.row["target_role"] == "Analyst"
    finally:
        app.dependency_overrides.clear()


def test_filing_payment_marks_the_intake_and_leaves_myrology_alone(monkeypatch) -> None:
    called: dict[str, Any] = {}
    monkeypatch.setattr(payments_router.filing_intake, "mark_paid", lambda uid: called.update(paid=uid))
    monkeypatch.setattr(payments_router, "_unlock_myrology", lambda uid: called.update(myrology=uid))
    payments_router._apply_entitlement("u9", payments_router.PRODUCTS["filing_intake"])
    assert called == {"paid": "u9"}
    assert payments_router.PRODUCTS["filing_intake"].price_paise == 59900
    assert payments_router.PRODUCTS["xp_pack"].key == "myro_xp_launch_pack"
