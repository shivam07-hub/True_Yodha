"""Human Check endpoints: the owner sees no WhatsApp number or draft, the
reviewer routes need the admin token, and out-of-coins answers with the
shortfall instead of opening a check."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import human_checks as router_mod
from app.security import admin_auth
from app.services import human_check
from tests.test_human_check import InMemoryChecks

URL = "https://www.linkedin.com/in/someone-real/"


@pytest.fixture(autouse=True)
def _auth() -> None:
    app.dependency_overrides[router_mod.get_principal] = lambda: router_mod.Principal(id="u1", email="u1@example.com")
    yield
    app.dependency_overrides.pop(router_mod.get_principal, None)


@pytest.fixture()
def store(monkeypatch: pytest.MonkeyPatch) -> InMemoryChecks:
    s = InMemoryChecks()
    monkeypatch.setattr(router_mod, "_store", lambda: s)
    monkeypatch.setattr(human_check, "notify_reviewer", lambda _row: None)
    monkeypatch.setattr(human_check, "notify_user", lambda _row: None)
    return s


def test_my_checks_never_carry_the_whatsapp_number_or_the_draft(store: InMemoryChecks) -> None:
    check = human_check.open_check(store, "u1", billing_payment_id="pay-1", job_id=None)
    human_check.assign_linkedin(store, "u1", check["id"], linkedin_url=URL, whatsapp="9876543210")
    store.rows[check["id"]]["draft"] = {"headline": "reviewer only"}

    with TestClient(app) as client:
        response = client.get("/human-checks", headers={"Authorization": "Bearer t"})

    assert response.status_code == 200, response.text
    [out] = response.json()["checks"]
    assert out["kind"] == "linkedin"
    assert "contact_whatsapp" not in out
    assert "draft" not in out


def test_spending_a_check_on_linkedin_rejects_a_search_url(store: InMemoryChecks) -> None:
    check = human_check.open_check(store, "u1", billing_payment_id="pay-1", job_id=None)
    with TestClient(app) as client:
        response = client.post(
            f"/human-checks/{check['id']}/linkedin",
            json={"linkedin_url": "https://www.linkedin.com/search/results/people/", "whatsapp": "9876543210"},
            headers={"Authorization": "Bearer t"},
        )
    assert response.status_code == 422


def test_out_of_coins_answers_with_the_shortfall_and_opens_nothing(
    store: InMemoryChecks, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _refuse(user_id: str, amount: int, action: str, **_kw: Any) -> int:
        raise human_check.xp_service.InsufficientXPError(amount=amount, balance=3000, action=action)

    monkeypatch.setattr(human_check.xp_service, "charge_or_raise", _refuse)
    with TestClient(app) as client:
        response = client.post(
            "/human-checks/linkedin",
            json={"linkedin_url": URL, "whatsapp": "9876543210"},
            headers={"Authorization": "Bearer t"},
        )
    assert response.status_code == 400
    assert "5000" in response.json()["detail"]
    assert store.rows == {}


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/admin/human-checks"),
        ("post", "/admin/human-checks/x/claim"),
        ("post", "/admin/human-checks/x/deliver"),
        ("post", "/admin/human-checks/x/close-call"),
        ("post", "/admin/payments/x/settle"),
        ("get", "/admin/human-checks/x/document"),
    ],
)
def test_reviewer_routes_need_the_admin_token(method: str, path: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin_auth.settings, "job_switch_admin_token", "the-token")
    with TestClient(app) as client:
        response = getattr(client, method)(path, headers={"X-Myro-Admin-Token": "wrong"})
    assert response.status_code == 401


def test_claim_needs_the_reviewer_name_set(store: InMemoryChecks, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin_auth.settings, "job_switch_admin_token", "the-token")
    monkeypatch.setattr(router_mod.settings, "human_check_reviewer_name", "")
    check = human_check.open_check(store, "u1", billing_payment_id="pay-1", job_id="job-1")
    with TestClient(app) as client:
        response = client.post(f"/admin/human-checks/{check['id']}/claim", headers={"X-Myro-Admin-Token": "the-token"})
    assert response.status_code == 503
    assert store.rows[check["id"]]["status"] == "queued"
