"""Magic-link sign-in now mints the link app-side and delivers via Resend.

Covers the auth_links mint (create-or-existing + generate_link) and the router
wiring: success records "sent"; any failure records "failed" but always returns
the success-shaped, non-enumerable response.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.routers import auth as auth_router
from app.services import auth_links


# ── auth_links.mint_login_link ──────────────────────────────────────────────


class _AdminApi:
    def __init__(self, *, create_exc: Exception | None = None, link: str = "https://link") -> None:
        self._create_exc = create_exc
        self._link = link
        self.created: list[dict[str, Any]] = []
        self.linked: list[dict[str, Any]] = []

    def create_user(self, attrs: dict[str, Any]) -> Any:
        self.created.append(attrs)
        if self._create_exc is not None:
            raise self._create_exc
        return SimpleNamespace()

    def generate_link(self, params: dict[str, Any]) -> Any:
        self.linked.append(params)
        return SimpleNamespace(properties=SimpleNamespace(action_link=self._link))


class _Admin:
    def __init__(self, api: _AdminApi) -> None:
        self.auth = SimpleNamespace(admin=api)


def test_mint_creates_then_links_for_new_email() -> None:
    api = _AdminApi(link="https://himyro.com/verify?token=abc")
    link = auth_links.mint_login_link(_Admin(api), email="new@x.com", redirect_to="https://himyro.com/cb")

    assert link == "https://himyro.com/verify?token=abc"
    assert api.created == [{"email": "new@x.com", "email_confirm": True}]
    assert api.linked[0]["type"] == "magiclink"
    assert api.linked[0]["options"]["redirect_to"] == "https://himyro.com/cb"


def test_mint_swallows_duplicate_and_still_links() -> None:
    api = _AdminApi(create_exc=_FakeAuthError("already registered", status=422, code="email_exists"))
    link = auth_links.mint_login_link(_Admin(api), email="old@x.com", redirect_to=None)

    assert link == "https://link"
    assert api.linked[0]["options"] == {}  # no redirect_to passed through


def test_mint_reraises_genuine_create_error() -> None:
    api = _AdminApi(create_exc=_FakeAuthError("boom", status=500, code="unexpected_failure"))
    try:
        auth_links.mint_login_link(_Admin(api), email="x@x.com", redirect_to=None)
    except _FakeAuthError as exc:
        assert exc.status == 500
    else:  # pragma: no cover
        raise AssertionError("expected the genuine error to propagate")


def test_is_already_exists_classification() -> None:
    assert auth_links._is_already_exists(_FakeAuthError("dup", 422, "email_exists"))
    assert auth_links._is_already_exists(_FakeAuthError("user already registered", 422, "other"))
    assert not auth_links._is_already_exists(_FakeAuthError("nope", 500, "unexpected_failure"))
    assert not auth_links._is_already_exists(_FakeAuthError("bad", 422, "weak_password"))


# ── router wiring ────────────────────────────────────────────────────────────


class _FakeAuthError(Exception):
    def __init__(self, message: str, status: int, code: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class _RouterAdmin:
    """Supports the rate-count rpc + the attempts insert the router performs."""

    def __init__(self, attempts: int = 0) -> None:
        self._attempts = attempts
        self.recorded: list[dict[str, Any]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> Any:
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=self._attempts))

    def table(self, name: str) -> Any:
        def _insert(row: dict[str, Any]) -> Any:
            self.recorded.append(row)
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=[row]))

        return SimpleNamespace(insert=_insert)


def _request() -> Any:
    return SimpleNamespace(
        headers={"x-forwarded-for": "9.9.9.9"},
        client=SimpleNamespace(host="9.9.9.9"),
    )


def _outcomes(admin: _RouterAdmin) -> list[str]:
    return [r["outcome"] for r in admin.recorded]


def test_router_success_records_sent(monkeypatch: Any) -> None:
    admin = _RouterAdmin()
    sent: dict[str, Any] = {}

    monkeypatch.setattr(auth_router, "get_supabase_admin", lambda: admin)
    monkeypatch.setattr(auth_router.auth_links, "mint_login_link", lambda *a, **k: "https://himyro.com/v?t=1")

    def _send(*, to: str, subject: str, text: str) -> bool:
        sent.update(to=to, subject=subject, text=text)
        return True

    monkeypatch.setattr(auth_router.email_service, "send_email", _send)

    resp = auth_router.magic_link_request(
        SimpleNamespace(email="USER@x.com", redirect_to="https://himyro.com/cb"),
        _request(),
        user_agent="pytest",
    )

    assert resp.sent is True
    assert sent["to"] == "user@x.com"  # lowercased
    assert "https://himyro.com/v?t=1" in sent["text"]
    assert _outcomes(admin) == ["sent"]


def test_router_send_failure_is_failed_but_success_shaped(monkeypatch: Any) -> None:
    admin = _RouterAdmin()
    monkeypatch.setattr(auth_router, "get_supabase_admin", lambda: admin)
    monkeypatch.setattr(auth_router.auth_links, "mint_login_link", lambda *a, **k: "https://link")
    monkeypatch.setattr(auth_router.email_service, "send_email", lambda **k: False)

    resp = auth_router.magic_link_request(
        SimpleNamespace(email="user@x.com", redirect_to=None), _request(), user_agent=None
    )

    assert resp.sent is True  # never leak that delivery failed
    assert _outcomes(admin) == ["failed"]


def test_router_mint_failure_is_failed_but_success_shaped(monkeypatch: Any) -> None:
    admin = _RouterAdmin()
    monkeypatch.setattr(auth_router, "get_supabase_admin", lambda: admin)

    def _boom(*a: Any, **k: Any) -> str:
        raise _FakeAuthError("supabase down", 500, "unexpected_failure")

    monkeypatch.setattr(auth_router.auth_links, "mint_login_link", _boom)
    monkeypatch.setattr(auth_router.email_service, "send_email", lambda **k: True)

    resp = auth_router.magic_link_request(
        SimpleNamespace(email="user@x.com", redirect_to=None), _request(), user_agent=None
    )

    assert resp.sent is True
    assert _outcomes(admin) == ["failed"]
