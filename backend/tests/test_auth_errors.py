"""Auth failures must arrive as actionable codes, not one generic retry.

The regression this locks: signing up with an email that already has an
account returned 400 "Could not create the account. Please try again." — the
one instruction guaranteed to fail again. The frontend recovery beat
(flip to sign-in, prefilled) branches on `detail.code`, so the code is the
contract, not the prose.
"""

from __future__ import annotations

import pytest
from gotrue.errors import AuthApiError, AuthWeakPasswordError

from app.security.auth_errors import auth_error_code, login_http_error, signup_http_error


def _api_error(code: str, status: int = 400) -> AuthApiError:
    return AuthApiError(f"supabase says {code}", status, code)  # type: ignore[arg-type]


# ─── code extraction ───────────────────────────────────────────────────────


def test_auth_error_code_reads_supabase_code() -> None:
    assert auth_error_code(_api_error("user_already_exists")) == "user_already_exists"


def test_auth_error_code_is_none_for_plain_exceptions() -> None:
    assert auth_error_code(RuntimeError("connection reset")) is None


# ─── signup ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("code", ["user_already_exists", "email_exists", "identity_already_exists"])
def test_existing_email_is_409_email_taken(code: str) -> None:
    err = signup_http_error(_api_error(code, 422))
    assert err.status_code == 409
    assert err.detail["code"] == "email_taken"
    # Copy must name the recovery, never "try again".
    assert "sign in" in err.detail["message"].lower()
    assert "try again" not in err.detail["message"].lower()


def test_weak_password_is_422_with_reasons() -> None:
    exc = AuthWeakPasswordError("too short", 422, ["length"])
    err = signup_http_error(exc)
    assert err.status_code == 422
    assert err.detail["code"] == "weak_password"
    assert err.detail["reasons"] == ["length"]


def test_invalid_email_is_422() -> None:
    err = signup_http_error(_api_error("email_address_invalid", 400))
    assert err.status_code == 422
    assert err.detail["code"] == "invalid_email"


def test_rate_limited_signup_is_429_with_retry_after() -> None:
    err = signup_http_error(_api_error("over_request_rate_limit", 429))
    assert err.status_code == 429
    assert err.detail["code"] == "rate_limited"
    assert err.headers is not None and err.headers["Retry-After"] == "60"


def test_signup_disabled_is_503() -> None:
    err = signup_http_error(_api_error("signup_disabled", 422))
    assert err.status_code == 503
    assert err.detail["code"] == "signup_unavailable"


def test_unknown_signup_failure_stays_generic_400() -> None:
    """Narrow the dead ends; never invent certainty about an unknown failure."""
    err = signup_http_error(RuntimeError("postgres exploded"))
    assert err.status_code == 400
    assert err.detail["code"] == "signup_failed"


# ─── login ─────────────────────────────────────────────────────────────────


def test_unconfirmed_email_is_its_own_code_not_bad_credentials() -> None:
    """Retyping a password can never fix an unconfirmed email."""
    err = login_http_error(_api_error("email_not_confirmed", 400))
    assert err.status_code == 403
    assert err.detail["code"] == "email_not_confirmed"


def test_bad_credentials_stay_generic_401() -> None:
    """Login must not become an account-enumeration oracle."""
    err = login_http_error(_api_error("invalid_credentials", 400))
    assert err.status_code == 401
    assert err.detail["code"] == "invalid_credentials"
    assert err.detail["message"] == "Invalid email or password."


def test_login_does_not_leak_that_the_user_is_missing() -> None:
    err = login_http_error(_api_error("user_not_found", 404))
    assert err.status_code == 401
    assert err.detail["message"] == "Invalid email or password."


def test_rate_limited_login_is_429() -> None:
    err = login_http_error(_api_error("over_request_rate_limit", 429))
    assert err.status_code == 429
    assert err.detail["code"] == "rate_limited"
